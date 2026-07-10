// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;

pub(super) fn vnc_error_category_from_message(message: &str) -> RemoteDesktopErrorCategory {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("expected an initial connect")
        || normalized.contains("non-vnc connect")
        || normalized.contains("second connect request")
    {
        RemoteDesktopErrorCategory::Configuration
    } else if normalized.contains("password") || normalized.contains("authentication") {
        RemoteDesktopErrorCategory::Authentication
    } else if normalized.contains("tcp")
        || normalized.contains("connection")
        || normalized.contains("read failed")
        || normalized.contains("write failed")
    {
        RemoteDesktopErrorCategory::Network
    } else if normalized.contains("unsupported vnc security")
        || normalized.contains("security type")
        || normalized.contains("security types")
        || normalized.contains("security negotiation")
    {
        RemoteDesktopErrorCategory::LegacySecurity
    } else if normalized.contains("protocol") || normalized.contains("unsupported") {
        RemoteDesktopErrorCategory::Protocol
    } else {
        RemoteDesktopErrorCategory::Unknown
    }
}

impl VncSessionSharedState {
    pub(super) fn new(width: u16, height: u16) -> Self {
        Self {
            width: AtomicU16::new(width),
            height: AtomicU16::new(height),
            force_next_base_frame: AtomicBool::new(false),
        }
    }

    pub(super) fn size(&self) -> (u16, u16) {
        (
            self.width.load(Ordering::Acquire),
            self.height.load(Ordering::Acquire),
        )
    }

    pub(super) fn store_size(&self, width: u16, height: u16) {
        self.width.store(width, Ordering::Release);
        self.height.store(height, Ordering::Release);
    }

    pub(super) fn request_base_frame(&self) {
        // RequestFrame is a UI recovery path, so the next framebuffer payload
        // must rebuild the front-end backing buffer instead of remaining dirty.
        self.force_next_base_frame.store(true, Ordering::Release);
    }

    pub(super) fn cancel_base_frame_request(&self) {
        self.force_next_base_frame.store(false, Ordering::Release);
    }

    pub(super) fn take_base_frame_request(&self) -> bool {
        self.force_next_base_frame.swap(false, Ordering::AcqRel)
    }
}

impl VncConnection {
    pub(super) fn connect(
        config: &VncSessionConfig,
        event_writer: SharedEventWriter,
        diagnostics: VncDiagnostics,
    ) -> Result<Self, String> {
        let mut stream = TcpStream::connect((config.endpoint.host.as_str(), config.endpoint.port))
            .map_err(|error| format!("VNC TCP connection failed: {error}"))?;
        stream
            .set_nodelay(true)
            .map_err(|error| format!("VNC TCP option setup failed: {error}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|error| format!("VNC read timeout setup failed: {error}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(10)))
            .map_err(|error| format!("VNC write timeout setup failed: {error}"))?;

        let handshake = handshake_vnc(&mut stream, config.password.as_ref())?;
        diagnostics.log(format!(
            "handshake protocol={} legacy_security={} security={} security_type={}",
            handshake.protocol_version.as_str(),
            handshake.legacy_security,
            handshake.security.as_str(),
            handshake.security.code()
        ));
        let (width, height) = read_server_init(&mut stream)?;
        diagnostics.log(format!("server_init framebuffer={width}x{height}"));
        write_pixel_format(&mut stream)?;
        write_encodings(&mut stream)?;
        diagnostics.log(format!("encodings advertised={VNC_ADVERTISED_ENCODINGS:?}"));

        let reader = stream
            .try_clone()
            .map_err(|error| format!("VNC stream clone failed: {error}"))?;
        let session_state = Arc::new(VncSessionSharedState::new(width, height));
        Ok(Self {
            writer: Arc::new(Mutex::new(stream)),
            reader: Some(reader),
            event_writer,
            diagnostics,
            closed: Arc::new(AtomicBool::new(false)),
            session_state,
            width,
            height,
        })
    }

    pub(super) fn start_reader(&mut self) {
        let Some(reader) = self.reader.take() else {
            return;
        };
        let writer = self.writer.clone();
        let event_writer = self.event_writer.clone();
        let diagnostics = self.diagnostics;
        let closed = self.closed.clone();
        let session_state = self.session_state.clone();
        let width = self.width;
        let height = self.height;
        thread::Builder::new()
            .name("oxideterm-vnc-reader".to_string())
            .spawn(move || {
                read_vnc_events(
                    reader,
                    writer,
                    event_writer,
                    diagnostics,
                    closed,
                    session_state,
                    width,
                    height,
                )
            })
            .ok();
    }

    pub(super) fn request_framebuffer_update(&self, incremental: bool) -> Result<(), String> {
        let (width, height) = self.session_state.size();
        request_framebuffer_update(&self.writer, incremental, width, height)
    }

    pub(super) fn request_full_frame_recovery(&self) -> Result<(), String> {
        self.session_state.request_base_frame();
        if let Err(error) = self.request_framebuffer_update(false) {
            self.session_state.cancel_base_frame_request();
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn send_pointer(&self, x: u16, y: u16, buttons: u8) -> Result<(), String> {
        let mut message = Vec::with_capacity(6);
        message.push(5);
        message.push(buttons);
        push_be_u16(&mut message, x);
        push_be_u16(&mut message, y);
        write_vnc_message(&self.writer, &message)
    }

    pub(super) fn send_key(&self, keysym: u32, down: bool) -> Result<(), String> {
        let mut message = Vec::with_capacity(8);
        message.push(4);
        message.push(u8::from(down));
        message.extend_from_slice(&[0, 0]);
        push_be_u32(&mut message, keysym);
        write_vnc_message(&self.writer, &message)
    }

    pub(super) fn send_client_cut_text(&self, text: &str) -> Result<(), String> {
        let bytes = text.as_bytes();
        let len = u32::try_from(bytes.len())
            .map_err(|_| "VNC clipboard text is too large to send.".to_string())?;
        let mut message = Vec::with_capacity(8 + bytes.len());
        message.push(6);
        message.extend_from_slice(&[0, 0, 0]);
        push_be_u32(&mut message, len);
        message.extend_from_slice(bytes);
        write_vnc_message(&self.writer, &message)
    }

    pub(super) fn shutdown(&self) {
        self.closed.store(true, Ordering::Release);
        if let Ok(stream) = self.writer.lock() {
            let _ = stream.shutdown(Shutdown::Both);
        }
    }
}

pub(super) fn handshake_vnc(
    stream: &mut TcpStream,
    password: Option<&RemoteDesktopSecret>,
) -> Result<VncHandshakeInfo, String> {
    let server_version = read_exact_array::<12, _>(stream)
        .map_err(|error| format!("VNC protocol banner read failed: {error}"))?;
    if !server_version.starts_with(b"RFB ") {
        return Err("VNC server did not send an RFB protocol banner.".to_string());
    }

    let legacy_security = server_version.starts_with(b"RFB 003.003");
    let (client_version, protocol_version) = if legacy_security {
        (VNC_PROTOCOL_VERSION_33, VncProtocolVersion::Rfb003003)
    } else {
        (VNC_PROTOCOL_VERSION_38, VncProtocolVersion::Rfb003008)
    };
    stream
        .write_all(client_version)
        .map_err(|error| format!("VNC protocol banner write failed: {error}"))?;

    let security = if legacy_security {
        negotiate_legacy_security(stream, password)
    } else {
        negotiate_modern_security(stream, password)
    }?;
    Ok(VncHandshakeInfo {
        protocol_version,
        security,
        legacy_security,
    })
}

pub(super) fn negotiate_legacy_security(
    stream: &mut TcpStream,
    password: Option<&RemoteDesktopSecret>,
) -> Result<VncSecuritySelection, String> {
    let security_type =
        read_be_u32(stream).map_err(|error| format!("VNC security type read failed: {error}"))?;
    match security_type {
        0 => Err(read_reason(stream)
            .unwrap_or_else(|_| "VNC server rejected security negotiation.".to_string())),
        1 => write_client_init(stream).map(|_| VncSecuritySelection::None),
        2 => authenticate_vnc_password(stream, password)
            .and_then(|_| write_client_init(stream))
            .map(|_| VncSecuritySelection::VncAuth),
        other => Err(format!("Unsupported VNC security type {other}.")),
    }
}

pub(super) fn negotiate_modern_security(
    stream: &mut TcpStream,
    password: Option<&RemoteDesktopSecret>,
) -> Result<VncSecuritySelection, String> {
    let count =
        read_u8(stream).map_err(|error| format!("VNC security list read failed: {error}"))?;
    if count == 0 {
        return Err(read_reason(stream)
            .unwrap_or_else(|_| "VNC server rejected security negotiation.".to_string()));
    }

    let mut security_types = vec![0; count as usize];
    stream
        .read_exact(&mut security_types)
        .map_err(|error| format!("VNC security list read failed: {error}"))?;
    if security_types.contains(&VNC_SECURITY_NONE)
        && password.is_none_or(|secret| secret.is_empty())
    {
        stream
            .write_all(&[VNC_SECURITY_NONE])
            .map_err(|error| format!("VNC security selection failed: {error}"))?;
        let result = read_be_u32(stream)
            .map_err(|error| format!("VNC security result read failed: {error}"))?;
        if result != 0 {
            return Err(read_reason(stream)
                .unwrap_or_else(|_| "VNC security negotiation failed.".to_string()));
        }
        return write_client_init(stream).map(|_| VncSecuritySelection::None);
    }

    if security_types.contains(&VNC_SECURITY_VNC_AUTH) {
        stream
            .write_all(&[VNC_SECURITY_VNC_AUTH])
            .map_err(|error| format!("VNC security selection failed: {error}"))?;
        authenticate_vnc_password(stream, password)?;
        return write_client_init(stream).map(|_| VncSecuritySelection::VncAuth);
    }

    Err(format!(
        "Unsupported VNC security types: {:?}.",
        security_types
    ))
}

pub(super) fn authenticate_vnc_password(
    stream: &mut TcpStream,
    password: Option<&RemoteDesktopSecret>,
) -> Result<(), String> {
    let password = password
        .filter(|secret| !secret.is_empty())
        .ok_or_else(|| "VNC server requires password authentication.".to_string())?;
    let challenge = read_exact_array::<16, _>(stream)
        .map_err(|error| format!("VNC password challenge read failed: {error}"))?;
    // VNC authentication derives a request-scoped DES key from the configured
    // password. Keep both the key and response zeroized after the handshake.
    let key = vnc_auth_key(password);
    let mut response = Zeroizing::new(challenge);
    encrypt_vnc_challenge(&key, &mut response)?;
    stream
        .write_all(response.as_slice())
        .map_err(|error| format!("VNC password response write failed: {error}"))?;
    let result =
        read_be_u32(stream).map_err(|error| format!("VNC security result read failed: {error}"))?;
    if result == 0 {
        Ok(())
    } else {
        Err(read_reason(stream)
            .unwrap_or_else(|_| "VNC password authentication failed.".to_string()))
    }
}

pub(super) fn vnc_auth_key(password: &RemoteDesktopSecret) -> Zeroizing<[u8; 8]> {
    let mut key = Zeroizing::new([0u8; 8]);
    for (slot, byte) in key
        .iter_mut()
        .zip(password.expose_secret().as_bytes().iter().copied().take(8))
    {
        *slot = byte.reverse_bits();
    }
    key
}

pub(super) fn encrypt_vnc_challenge(
    key: &Zeroizing<[u8; 8]>,
    response: &mut Zeroizing<[u8; 16]>,
) -> Result<(), String> {
    let cipher = Des::new_from_slice(key.as_slice())
        .map_err(|_| "VNC password cipher setup failed.".to_string())?;
    for block in response.chunks_exact_mut(8) {
        let mut cipher_block = Block::<Des>::default();
        cipher_block.copy_from_slice(block);
        cipher.encrypt_block(&mut cipher_block);
        block.copy_from_slice(&cipher_block);
    }
    Ok(())
}

pub(super) fn write_client_init(stream: &mut TcpStream) -> Result<(), String> {
    // Shared mode avoids disconnecting external viewers when the server allows
    // multiple clients.
    stream
        .write_all(&[1])
        .map_err(|error| format!("VNC client init failed: {error}"))
}

pub(super) fn read_server_init(stream: &mut TcpStream) -> Result<(u16, u16), String> {
    let init = read_exact_array::<24, _>(stream)
        .map_err(|error| format!("VNC init read failed: {error}"))?;
    let width = be_u16(&init[0..2]);
    let height = be_u16(&init[2..4]);
    let name_len = be_u32(&init[20..24]) as usize;
    if name_len > 0 {
        read_exact_vec(stream, name_len)
            .map_err(|error| format!("VNC desktop name read failed: {error}"))?;
    }
    Ok((width, height))
}

pub(super) fn write_pixel_format(stream: &mut TcpStream) -> Result<(), String> {
    let mut message = Vec::with_capacity(20);
    message.extend_from_slice(&[0, 0, 0, 0]);
    message.extend_from_slice(&[
        32, 24, 0, 1, // 32-bit little-endian true color.
        0, 255, 0, 255, 0, 255, // color max values.
        16, 8, 0, // red, green, blue shifts => BGRA bytes.
        0, 0, 0,
    ]);
    stream
        .write_all(&message)
        .map_err(|error| format!("VNC pixel format write failed: {error}"))
}

pub(super) fn write_encodings(stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(&set_encodings_message())
        .map_err(|error| format!("VNC encoding write failed: {error}"))
}

pub(super) fn set_encodings_message() -> Vec<u8> {
    let mut message = Vec::with_capacity(32);
    message.push(2);
    message.push(0);
    push_be_u16(&mut message, VNC_ADVERTISED_ENCODINGS.len() as u16);
    for encoding in VNC_ADVERTISED_ENCODINGS {
        push_be_i32(&mut message, encoding);
    }
    message
}

pub(super) fn read_vnc_events(
    mut reader: TcpStream,
    writer: SharedVncWriter,
    event_writer: SharedEventWriter,
    diagnostics: VncDiagnostics,
    closed: Arc<AtomicBool>,
    session_state: Arc<VncSessionSharedState>,
    width: u16,
    height: u16,
) {
    let mut framebuffer = VncFramebuffer::new(width, height);
    let mut decode_state = VncDecodeState::default();
    let mut counters = VncReaderDiagnosticsCounters::default();
    let mut sent_initial_frame = false;
    loop {
        match read_vnc_event(&mut reader, &mut decode_state) {
            Ok(event) => {
                let summary = vnc_server_event_summary(&event);
                counters.server_messages = counters.server_messages.saturating_add(1);
                counters.helper_side_events = counters
                    .helper_side_events
                    .saturating_add(summary.side_events);
                counters.dirty_rects = counters.dirty_rects.saturating_add(summary.dirty_rects);
                counters.dirty_pixels = counters.dirty_pixels.saturating_add(summary.dirty_pixels);
                for helper_event in vnc_helper_events(&event) {
                    let _ = send_event(&event_writer, helper_event);
                }
                if let Some(change) = framebuffer.apply(event) {
                    session_state.store_size(framebuffer.width as u16, framebuffer.height as u16);
                    let frame_event = vnc_frame_event_for_change(
                        &framebuffer,
                        change,
                        &mut sent_initial_frame,
                        session_state.take_base_frame_request(),
                    );
                    match &frame_event {
                        RemoteDesktopHelperEvent::Frame { frame } => {
                            counters.helper_frames = counters.helper_frames.saturating_add(1);
                            diagnostics.log(format!(
                                "frame kind=base size={}x{} helper_frames={} helper_updates={} server_messages={} dirty_rects_total={} dirty_rects_batch={} dirty_pixels={} side_events={}",
                                frame.size.width,
                                frame.size.height,
                                counters.helper_frames,
                                counters.helper_frame_updates,
                                counters.server_messages,
                                counters.dirty_rects,
                                summary.dirty_rects,
                                counters.dirty_pixels,
                                counters.helper_side_events
                            ));
                        }
                        RemoteDesktopHelperEvent::FrameUpdate { update } => {
                            counters.helper_frame_updates =
                                counters.helper_frame_updates.saturating_add(1);
                            diagnostics.log(format!(
                                "frame kind=update rect={}x{} helper_frames={} helper_updates={} server_messages={} dirty_rects_total={} dirty_rects_batch={} dirty_pixels={} side_events={}",
                                update.rect.width,
                                update.rect.height,
                                counters.helper_frames,
                                counters.helper_frame_updates,
                                counters.server_messages,
                                counters.dirty_rects,
                                summary.dirty_rects,
                                counters.dirty_pixels,
                                counters.helper_side_events
                            ));
                        }
                        _ => {}
                    }
                    let _ = send_event(&event_writer, frame_event);
                }
                let _ = request_framebuffer_update(
                    &writer,
                    true,
                    framebuffer.width as u16,
                    framebuffer.height as u16,
                );
            }
            Err(error) => {
                if !closed.load(Ordering::Acquire) {
                    diagnostics.log(format!(
                        "disconnect category={:?}",
                        vnc_error_category_from_message(&error)
                    ));
                    let _ = send_event(
                        &event_writer,
                        RemoteDesktopHelperEvent::Disconnected {
                            reason: Some(error),
                        },
                    );
                }
                return;
            }
        }
    }
}
