// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;

pub(super) fn is_remote_desktop_frame_event(event: &RemoteDesktopHelperEvent) -> bool {
    matches!(
        event,
        RemoteDesktopHelperEvent::Frame { .. } | RemoteDesktopHelperEvent::FrameUpdate { .. }
    )
}

pub(super) fn push_remote_desktop_frame_event(
    queue: &mut RemoteDesktopFrameQueue,
    event: RemoteDesktopHelperEvent,
    max_events: usize,
    max_dirty_bytes: usize,
) -> RemoteDesktopFrameQueuePush {
    if matches!(event, RemoteDesktopHelperEvent::Frame { .. }) {
        let event_bytes = remote_desktop_frame_event_bytes(&event);
        queue.frames.clear();
        queue.queued_dirty_bytes = 0;
        if event_bytes > REMOTE_DESKTOP_FRAME_QUEUE_MAX_BASE_BYTES {
            queue.awaiting_base_frame = true;
            return RemoteDesktopFrameQueuePush::RecoveryRequired;
        }
        queue.frames.push_back(event);
        queue.awaiting_base_frame = false;
        return RemoteDesktopFrameQueuePush::Queued;
    }

    if queue.awaiting_base_frame {
        // Applying deltas after a dropped predecessor would corrupt the local
        // backing frame. Wait for the requested base instead.
        return RemoteDesktopFrameQueuePush::AwaitingRecovery;
    }

    if let Some(existing) = queue.frames.back_mut() {
        if let Err(incoming) = try_merge_remote_desktop_frame_event(existing, event) {
            queue.frames.push_back(incoming);
        }
    } else {
        queue.frames.push_back(event);
    }
    queue.queued_dirty_bytes = queue
        .frames
        .iter()
        .filter(|event| matches!(event, RemoteDesktopHelperEvent::FrameUpdate { .. }))
        .map(remote_desktop_frame_event_bytes)
        .fold(0_usize, usize::saturating_add);
    if queue.frames.len() <= max_events && queue.queued_dirty_bytes <= max_dirty_bytes {
        return RemoteDesktopFrameQueuePush::Queued;
    }

    // A queued base may already include every compatible delta seen before
    // saturation. Keep that recoverable snapshot, discard only the now-broken
    // tail, and require a newer base before accepting further updates.
    let recoverable_frame = queue
        .frames
        .iter()
        .rposition(|event| matches!(event, RemoteDesktopHelperEvent::Frame { .. }))
        .and_then(|index| queue.frames.remove(index));
    queue.frames.clear();
    queue.queued_dirty_bytes = 0;
    if let Some(frame) = recoverable_frame {
        queue.frames.push_back(frame);
    }
    queue.awaiting_base_frame = true;
    RemoteDesktopFrameQueuePush::RecoveryRequired
}

pub(super) fn remote_desktop_frame_event_bytes(event: &RemoteDesktopHelperEvent) -> usize {
    match event {
        RemoteDesktopHelperEvent::Frame { frame } => frame.bytes.len(),
        RemoteDesktopHelperEvent::FrameUpdate { update } => update.bytes.len(),
        _ => 0,
    }
}

pub(super) fn try_merge_remote_desktop_frame_event(
    existing: &mut RemoteDesktopHelperEvent,
    incoming: RemoteDesktopHelperEvent,
) -> Result<(), RemoteDesktopHelperEvent> {
    match existing {
        RemoteDesktopHelperEvent::Frame { frame } => match incoming {
            RemoteDesktopHelperEvent::FrameUpdate { update } => {
                if !frame.apply_update(&update) {
                    return Err(RemoteDesktopHelperEvent::FrameUpdate { update });
                }
            }
            incoming => {
                *existing = incoming;
            }
        },
        RemoteDesktopHelperEvent::FrameUpdate { update } => match incoming {
            RemoteDesktopHelperEvent::FrameUpdate {
                update: incoming_update,
            } => {
                if !update.merge(&incoming_update) {
                    return Err(RemoteDesktopHelperEvent::FrameUpdate {
                        update: incoming_update,
                    });
                }
            }
            incoming => {
                *existing = incoming;
            }
        },
        slot => {
            *slot = incoming;
        }
    }
    Ok(())
}

pub(super) fn preview_remote_desktop_profile(
    protocol: RemoteDesktopProtocol,
) -> RemoteDesktopConnectionProfile {
    let label = match protocol {
        RemoteDesktopProtocol::Rdp => "RDP Preview",
        RemoteDesktopProtocol::Vnc => "VNC Preview",
    };

    RemoteDesktopConnectionProfile {
        id: format!("preview-{}", protocol.provider_id()),
        label: label.to_string(),
        protocol,
        endpoint: RemoteDesktopEndpoint::for_protocol("preview.local", protocol),
        username: None,
        domain: None,
        credential_ref: None,
        read_only: false,
    }
}

pub(super) fn run_remote_desktop_worker(
    tab_id: TabId,
    generation: u64,
    profile: RemoteDesktopConnectionProfile,
    provider: RemoteDesktopProviderManifest,
    password: Option<RemoteDesktopSecret>,
    initial_size: RemoteDesktopSize,
    scale_factor: Option<u32>,
    frame_slot: RemoteDesktopFrameDeliverySlot,
    worker_wake: RemoteDesktopWorkerWake,
    request_rx: mpsc::Receiver<RemoteDesktopHelperRequest>,
    delivery_tx: mpsc::Sender<RemoteDesktopWorkerDelivery>,
) {
    match spawn_remote_desktop_helper(&provider) {
        Ok((mut child, mut stdin)) => {
            let stdout = child.stdout.take();
            let connect = connect_request(&profile, password, initial_size, scale_factor);
            if let Err(error) =
                write_initial_remote_desktop_connect(&mut child, &mut stdin, &connect)
            {
                send_remote_desktop_worker_delivery(
                    &delivery_tx,
                    &worker_wake,
                    RemoteDesktopWorkerDelivery::TransportFailed {
                        tab_id,
                        generation,
                        message: error.to_string(),
                    },
                );
                worker_wake.stop();
                return;
            }
            let reader_thread = stdout.and_then(|stdout| {
                let reader_tx = delivery_tx.clone();
                let reader_frame_slot = frame_slot.clone();
                let reader_worker_wake = worker_wake.clone();
                thread::Builder::new()
                    .name(format!("remote-desktop-reader-{}", tab_id.0))
                    .spawn(move || {
                        read_remote_desktop_events(
                            tab_id,
                            generation,
                            stdout,
                            reader_tx,
                            reader_frame_slot,
                            reader_worker_wake,
                        )
                    })
                    .ok()
            });

            run_remote_desktop_writer(
                tab_id,
                generation,
                &mut stdin,
                request_rx,
                delivery_tx.clone(),
                worker_wake.clone(),
            );
            drop(stdin);
            let exit_code = child.wait().ok().and_then(|status| status.code());
            if let Some(reader_thread) = reader_thread {
                // Drain every event emitted before process exit before the
                // event-driven GPUI wake task receives its stop signal.
                let _ = reader_thread.join();
            }
            send_remote_desktop_worker_delivery(
                &delivery_tx,
                &worker_wake,
                RemoteDesktopWorkerDelivery::Event {
                    tab_id,
                    generation,
                    event: RemoteDesktopHelperEvent::Terminated { exit_code },
                },
            );
            worker_wake.stop();
            return;
        }
        Err(error) if !remote_desktop_provider_uses_fake_backend(&provider) => {
            send_remote_desktop_worker_delivery(
                &delivery_tx,
                &worker_wake,
                RemoteDesktopWorkerDelivery::TransportFailed {
                    tab_id,
                    generation,
                    message: format!("Remote desktop helper failed to start: {error}"),
                },
            );
            worker_wake.stop();
            return;
        }
        Err(_) => {}
    }

    // Only preview providers may fall back to the in-process fake helper.
    run_in_process_fake_remote_desktop(
        tab_id,
        generation,
        profile,
        initial_size,
        scale_factor,
        frame_slot,
        worker_wake.clone(),
        request_rx,
        delivery_tx,
    );
    worker_wake.stop();
}

pub(super) fn write_initial_remote_desktop_connect(
    child: &mut Child,
    stdin: &mut impl Write,
    connect: &RemoteDesktopHelperRequest,
) -> Result<(), RemoteDesktopJsonLineError> {
    if let Err(error) = write_request_line(stdin, connect) {
        // Startup owns both process termination and reaping until the initial
        // protocol handoff succeeds.
        terminate_remote_desktop_helper(child);
        return Err(error);
    }
    Ok(())
}

pub(super) fn terminate_remote_desktop_helper(child: &mut Child) {
    // Dropping Child does not terminate or reap it. A failed initial protocol
    // write must not leave a detached helper behind.
    let _ = child.kill();
    let _ = child.wait();
}

pub(super) fn remote_desktop_provider_uses_fake_backend(
    provider: &RemoteDesktopProviderManifest,
) -> bool {
    provider.entry.args.iter().any(|arg| arg == "--fake")
}

pub(super) fn spawn_remote_desktop_helper(
    provider: &RemoteDesktopProviderManifest,
) -> Result<(Child, ChildStdin), std::io::Error> {
    let resolved = resolve_remote_desktop_helper_command(&provider.entry.command);
    let mut command = Command::new(&resolved.command);
    configure_remote_desktop_helper_command(&mut command);
    command
        .args(&resolved.prefix_args)
        .args(&provider.entry.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Some(working_dir) = provider.entry.working_dir.as_ref() {
        command.current_dir(working_dir);
    } else if let Some(working_dir) = resolved.working_dir.as_ref() {
        command.current_dir(working_dir);
    }
    let mut child = command.spawn()?;
    let stdin = child.stdin.take().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "remote desktop helper stdin is unavailable",
        )
    })?;
    Ok((child, stdin))
}

pub(super) fn configure_remote_desktop_helper_command(command: &mut Command) {
    #[cfg(windows)]
    {
        // Remote desktop helpers are background protocol bridges with captured
        // stdio. They must not create a separate console window on Windows.
        command.creation_flags(REMOTE_DESKTOP_HELPER_CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

pub(super) struct ResolvedRemoteDesktopHelper {
    command: PathBuf,
    prefix_args: Vec<String>,
    working_dir: Option<PathBuf>,
}

pub(super) fn resolve_remote_desktop_helper_command(command: &str) -> ResolvedRemoteDesktopHelper {
    let command_path = Path::new(command);
    if command_path.components().count() > 1 || command_path.is_absolute() {
        return ResolvedRemoteDesktopHelper {
            command: command_path.to_path_buf(),
            prefix_args: Vec::new(),
            working_dir: None,
        };
    }

    if let Some(resolved) = development_remote_desktop_helper_command(command) {
        return resolved;
    }

    for candidate in bundled_remote_desktop_helper_candidates(command) {
        if candidate.exists() {
            return ResolvedRemoteDesktopHelper {
                command: candidate,
                prefix_args: Vec::new(),
                working_dir: None,
            };
        }
    }

    ResolvedRemoteDesktopHelper {
        command: PathBuf::from(command),
        prefix_args: Vec::new(),
        working_dir: None,
    }
}

pub(super) fn development_remote_desktop_helper_command(
    command: &str,
) -> Option<ResolvedRemoteDesktopHelper> {
    if !cfg!(debug_assertions)
        || !matches!(command, "oxideterm-rdp-helper" | "oxideterm-vnc-helper")
    {
        return None;
    }

    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)?
        .to_path_buf();
    if !workspace_root
        .join("crates")
        .join(command)
        .join("Cargo.toml")
        .exists()
    {
        return None;
    }

    if let Some(resolved) = fresh_development_helper_binary(&workspace_root, command) {
        return Some(resolved);
    }

    let mut prefix_args = vec![
        "run".to_string(),
        "--quiet".to_string(),
        "-p".to_string(),
        command.to_string(),
    ];
    prefix_args.push("--".to_string());

    // Debug app runs should execute the current helper source, not a stale
    // helper binary left next to the app from an earlier build.
    Some(ResolvedRemoteDesktopHelper {
        command: std::env::var_os("CARGO")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("cargo")),
        prefix_args,
        working_dir: Some(workspace_root),
    })
}

pub(super) fn fresh_development_helper_binary(
    workspace_root: &Path,
    command: &str,
) -> Option<ResolvedRemoteDesktopHelper> {
    let candidate = workspace_root
        .join("target")
        .join("debug")
        .join(platform_helper_binary_name(command));
    let binary_modified = candidate.metadata().ok()?.modified().ok()?;
    let helper_crate = workspace_root.join("crates").join(command);
    let protocol_crate = workspace_root
        .join("crates")
        .join("oxideterm-remote-desktop");
    let cargo_lock = workspace_root.join("Cargo.lock");
    if path_modified_after(&helper_crate, binary_modified)
        || path_modified_after(&protocol_crate, binary_modified)
        || path_modified_after(&cargo_lock, binary_modified)
    {
        return None;
    }

    Some(ResolvedRemoteDesktopHelper {
        command: candidate,
        prefix_args: Vec::new(),
        working_dir: None,
    })
}

pub(super) fn path_modified_after(path: &Path, cutoff: SystemTime) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if metadata
        .modified()
        .map(|modified| modified > cutoff)
        .unwrap_or(false)
    {
        return true;
    }
    if !metadata.is_dir() {
        return false;
    }

    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        let file_name = entry.file_name();
        if file_name == "target" {
            continue;
        }
        if path_modified_after(&entry_path, cutoff) {
            return true;
        }
    }
    false
}

pub(super) fn bundled_remote_desktop_helper_candidates(command: &str) -> Vec<PathBuf> {
    let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
    else {
        return Vec::new();
    };
    let helper_name = platform_helper_binary_name(command);
    let target_dirs = helper_target_resource_dirs();
    let mut roots = vec![
        exe_dir.join("resources"),
        exe_dir.join("..").join("Resources"),
    ];

    // Development builds keep helper binaries next to the app under target/*.
    roots.push(exe_dir.clone());

    let mut candidates = Vec::new();
    for root in roots {
        for target_dir in target_dirs {
            candidates.push(root.join("helpers").join(target_dir).join(&helper_name));
        }
        candidates.push(root.join("helpers").join(&helper_name));
        candidates.push(root.join(&helper_name));
    }
    candidates
}

pub(super) fn platform_helper_binary_name(command: &str) -> String {
    if cfg!(target_os = "windows") && !command.ends_with(".exe") {
        format!("{command}.exe")
    } else {
        command.to_string()
    }
}

pub(super) fn helper_target_resource_dirs() -> &'static [&'static str] {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        // Release packaging stores helpers under Cargo target triples. The
        // shorthand names remain fallbacks for older preview resource layouts.
        ("macos", "x86_64") => &["x86_64-apple-darwin", "macos_x64"],
        ("macos", "aarch64") => &["aarch64-apple-darwin", "macos_arm64"],
        ("windows", "x86_64") => &["x86_64-pc-windows-msvc", "windows_x64"],
        ("windows", "aarch64") => &["aarch64-pc-windows-msvc", "windows_arm64"],
        ("linux", "x86_64") => &["x86_64-unknown-linux-gnu", "linux_x64"],
        ("linux", "aarch64") => &["aarch64-unknown-linux-gnu", "linux_arm64"],
        _ => &[std::env::consts::ARCH],
    }
}

pub(super) fn default_remote_desktop_initial_size() -> RemoteDesktopSize {
    RemoteDesktopSize::clamped(REMOTE_DESKTOP_INITIAL_WIDTH, REMOTE_DESKTOP_INITIAL_HEIGHT)
}

pub(super) fn initial_remote_desktop_sizes_for_session(
    session: &RemoteDesktopSession,
) -> (RemoteDesktopSize, Option<RemoteDesktopSize>) {
    if let Some(viewport_size) = session.geometry.viewport_size() {
        let viewport_size = RemoteDesktopSize::clamped(viewport_size.width, viewport_size.height);
        return (
            remote_desktop_requested_size_for_viewport(
                viewport_size,
                session.last_viewport_scale_factor,
            ),
            Some(viewport_size),
        );
    }

    (
        session
            .state
            .snapshot()
            .size
            .unwrap_or_else(default_remote_desktop_initial_size),
        None,
    )
}

pub(super) fn remote_desktop_scale_factor_percent(scale_factor: f32) -> u32 {
    let percent = (scale_factor * REMOTE_DESKTOP_SCALE_PERCENT_MULTIPLIER).round();
    if percent.is_finite() {
        let percent = percent as u32;
        if (REMOTE_DESKTOP_MIN_SCALE_FACTOR_PERCENT..=REMOTE_DESKTOP_MAX_SCALE_FACTOR_PERCENT)
            .contains(&percent)
        {
            return percent;
        }
    }
    REMOTE_DESKTOP_DEFAULT_SCALE_FACTOR_PERCENT
}

pub(super) fn remote_desktop_requested_size_for_viewport(
    viewport_size: RemoteDesktopSize,
    scale_factor: Option<u32>,
) -> RemoteDesktopSize {
    let viewport_size = RemoteDesktopSize::clamped(viewport_size.width, viewport_size.height);
    let Some(scale_factor) = scale_factor else {
        return viewport_size;
    };
    if !(REMOTE_DESKTOP_MIN_SCALE_FACTOR_PERCENT..=REMOTE_DESKTOP_MAX_SCALE_FACTOR_PERCENT)
        .contains(&scale_factor)
    {
        return viewport_size;
    }

    // GPUI canvas bounds are logical pixels; RDP desktop_size is the remote
    // framebuffer pixel size, so high-DPI windows need an explicit conversion.
    let denominator = u64::from(REMOTE_DESKTOP_DEFAULT_SCALE_FACTOR_PERCENT);
    let scale_factor = u64::from(scale_factor);
    let width = remote_desktop_scaled_dimension(viewport_size.width, scale_factor, denominator);
    let height = remote_desktop_scaled_dimension(viewport_size.height, scale_factor, denominator);
    RemoteDesktopSize::clamped(width, height)
}

pub(super) fn remote_desktop_scaled_dimension(
    value: u32,
    scale_factor: u64,
    denominator: u64,
) -> u32 {
    let scaled = (u64::from(value) * scale_factor + denominator / 2) / denominator;
    u32::try_from(scaled).unwrap_or(u32::MAX)
}

pub(super) fn remote_desktop_resize_request_needed(
    current_frame_size: Option<RemoteDesktopSize>,
    pending_resize: Option<RemoteDesktopSize>,
    last_viewport_size: Option<RemoteDesktopSize>,
    last_sent_resize: Option<RemoteDesktopResizeRequestState>,
    viewport_size: RemoteDesktopSize,
    request_size: RemoteDesktopSize,
    viewport_scale_factor: Option<u32>,
) -> bool {
    let next_request = RemoteDesktopResizeRequestState {
        size: request_size,
        scale_factor: viewport_scale_factor,
    };
    if Some(next_request) == last_sent_resize {
        return false;
    }

    let frame_mismatch = remote_desktop_size_delta_is_meaningful(current_frame_size, request_size)
        && Some(request_size) != current_frame_size;
    let viewport_changed = Some(viewport_size) != last_viewport_size;
    let scale_changed = viewport_scale_factor.is_some()
        && last_sent_resize
            .is_some_and(|last_sent| last_sent.scale_factor != viewport_scale_factor);
    if !viewport_changed && !frame_mismatch && !scale_changed {
        return false;
    }
    if !frame_mismatch {
        return scale_changed;
    }
    if Some(request_size) == pending_resize {
        return scale_changed && last_sent_resize.is_some();
    }
    let last_sent_size = last_sent_resize.map(|last_sent| last_sent.size);
    if !remote_desktop_size_delta_is_meaningful(last_sent_size, request_size) && !scale_changed {
        return false;
    }
    true
}

pub(super) fn remote_desktop_resize_request_needed_for_capability(
    resize_supported: bool,
    current_frame_size: Option<RemoteDesktopSize>,
    pending_resize: Option<RemoteDesktopSize>,
    last_viewport_size: Option<RemoteDesktopSize>,
    last_sent_resize: Option<RemoteDesktopResizeRequestState>,
    viewport_size: RemoteDesktopSize,
    request_size: RemoteDesktopSize,
    viewport_scale_factor: Option<u32>,
) -> bool {
    // VNC's built-in provider has a fixed server framebuffer; viewport changes
    // still update local geometry, but they must not create remote resize state.
    resize_supported
        && remote_desktop_resize_request_needed(
            current_frame_size,
            pending_resize,
            last_viewport_size,
            last_sent_resize,
            viewport_size,
            request_size,
            viewport_scale_factor,
        )
}

pub(super) fn remote_desktop_size_delta_is_meaningful(
    previous: Option<RemoteDesktopSize>,
    next: RemoteDesktopSize,
) -> bool {
    previous.is_none_or(|previous| {
        previous.width.abs_diff(next.width) >= REMOTE_DESKTOP_RESIZE_DELTA_THRESHOLD
            || previous.height.abs_diff(next.height) >= REMOTE_DESKTOP_RESIZE_DELTA_THRESHOLD
    })
}

pub(super) fn read_remote_desktop_events(
    tab_id: TabId,
    generation: u64,
    stdout: impl std::io::Read,
    delivery_tx: mpsc::Sender<RemoteDesktopWorkerDelivery>,
    frame_slot: RemoteDesktopFrameDeliverySlot,
    worker_wake: RemoteDesktopWorkerWake,
) {
    let mut reader = BufReader::new(stdout);
    loop {
        match read_event_line(&mut reader) {
            Ok(Some(event)) => {
                deliver_remote_desktop_worker_event(
                    tab_id,
                    generation,
                    event,
                    &delivery_tx,
                    &frame_slot,
                    &worker_wake,
                );
            }
            Ok(None) => break,
            Err(error) => {
                send_remote_desktop_worker_delivery(
                    &delivery_tx,
                    &worker_wake,
                    RemoteDesktopWorkerDelivery::TransportFailed {
                        tab_id,
                        generation,
                        message: error.to_string(),
                    },
                );
                break;
            }
        }
    }
}

pub(super) fn deliver_remote_desktop_worker_event(
    tab_id: TabId,
    generation: u64,
    event: RemoteDesktopHelperEvent,
    delivery_tx: &mpsc::Sender<RemoteDesktopWorkerDelivery>,
    frame_slot: &RemoteDesktopFrameDeliverySlot,
    worker_wake: &RemoteDesktopWorkerWake,
) {
    if is_remote_desktop_frame_event(&event) {
        frame_slot.push(tab_id, generation, event, delivery_tx, worker_wake);
    } else {
        send_remote_desktop_worker_delivery(
            delivery_tx,
            worker_wake,
            RemoteDesktopWorkerDelivery::Event {
                tab_id,
                generation,
                event,
            },
        );
    }
}

pub(super) fn run_remote_desktop_writer(
    tab_id: TabId,
    generation: u64,
    stdin: &mut impl Write,
    request_rx: mpsc::Receiver<RemoteDesktopHelperRequest>,
    delivery_tx: mpsc::Sender<RemoteDesktopWorkerDelivery>,
    worker_wake: RemoteDesktopWorkerWake,
) {
    loop {
        let Ok(first_request) = request_rx.recv() else {
            return;
        };
        let mut disconnected = false;
        let mut coalescer = RemoteDesktopRequestWriteCoalescer::default();
        let mut requests = Vec::new();
        coalescer.push(first_request, &mut requests);

        for _ in 0..REMOTE_DESKTOP_REQUEST_WRITE_DRAIN_LIMIT {
            match request_rx.try_recv() {
                Ok(request) => coalescer.push(request, &mut requests),
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => {
                    disconnected = true;
                    break;
                }
            }
        }
        coalescer.flush(&mut requests);

        for request in requests {
            let should_close = matches!(request, RemoteDesktopHelperRequest::Close);
            if let Err(error) = write_request_line(stdin, &request) {
                send_remote_desktop_worker_delivery(
                    &delivery_tx,
                    &worker_wake,
                    RemoteDesktopWorkerDelivery::TransportFailed {
                        tab_id,
                        generation,
                        message: error.to_string(),
                    },
                );
                return;
            }
            if should_close {
                return;
            }
        }

        if disconnected {
            return;
        }
    }
}

#[derive(Default)]
pub(super) struct RemoteDesktopRequestWriteCoalescer {
    pending_mouse_move: Option<RemoteDesktopHelperRequest>,
}

impl RemoteDesktopRequestWriteCoalescer {
    pub(super) fn push(
        &mut self,
        request: RemoteDesktopHelperRequest,
        output: &mut Vec<RemoteDesktopHelperRequest>,
    ) {
        match request {
            RemoteDesktopHelperRequest::MouseMove { .. } => {
                // Mouse motion is lossy state. Keep the newest position before
                // writing to helper stdin so keyboard and click edges cannot
                // sit behind hundreds of stale move samples.
                self.pending_mouse_move = Some(request);
            }
            request => {
                self.flush(output);
                output.push(request);
            }
        }
    }

    pub(super) fn flush(&mut self, output: &mut Vec<RemoteDesktopHelperRequest>) {
        if let Some(request) = self.pending_mouse_move.take() {
            output.push(request);
        }
    }
}

pub(super) fn run_in_process_fake_remote_desktop(
    tab_id: TabId,
    generation: u64,
    profile: RemoteDesktopConnectionProfile,
    initial_size: RemoteDesktopSize,
    scale_factor: Option<u32>,
    frame_slot: RemoteDesktopFrameDeliverySlot,
    worker_wake: RemoteDesktopWorkerWake,
    request_rx: mpsc::Receiver<RemoteDesktopHelperRequest>,
    delivery_tx: mpsc::Sender<RemoteDesktopWorkerDelivery>,
) {
    let mut backend = RemoteDesktopFakeBackend::new(profile.protocol);
    for event in backend.handle_request(connect_request(&profile, None, initial_size, scale_factor))
    {
        deliver_remote_desktop_worker_event(
            tab_id,
            generation,
            event,
            &delivery_tx,
            &frame_slot,
            &worker_wake,
        );
    }

    for request in request_rx {
        let should_close = matches!(request, RemoteDesktopHelperRequest::Close);
        for event in backend.handle_request(request) {
            deliver_remote_desktop_worker_event(
                tab_id,
                generation,
                event,
                &delivery_tx,
                &frame_slot,
                &worker_wake,
            );
        }
        if should_close {
            break;
        }
    }
}

pub(super) fn connect_request(
    profile: &RemoteDesktopConnectionProfile,
    password: Option<RemoteDesktopSecret>,
    initial_size: RemoteDesktopSize,
    scale_factor: Option<u32>,
) -> RemoteDesktopHelperRequest {
    RemoteDesktopHelperRequest::Connect {
        protocol: profile.protocol,
        endpoint: profile.endpoint.clone(),
        username: profile.username.clone(),
        // Runtime-only credentials cross the UI/backend boundary here. They
        // are sent to the helper process and never stored in the profile model.
        password,
        domain: profile.domain.clone(),
        size: RemoteDesktopSize::clamped(initial_size.width, initial_size.height),
        // Initial and runtime display requests carry the same scale metadata so
        // IronRDP can negotiate high-DPI sessions before the first frame.
        scale_factor,
        read_only: profile.read_only,
    }
}
