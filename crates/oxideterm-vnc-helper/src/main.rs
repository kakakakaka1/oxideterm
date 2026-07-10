// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use std::{
    collections::{HashMap, HashSet},
    io::{self, BufRead, Read, Write},
    net::{Shutdown, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU16, Ordering},
    },
    thread,
    time::Duration,
};

use des::{
    Des,
    cipher::{Block, BlockCipherEncrypt, KeyInit},
};
use flate2::{Decompress, FlushDecompress, Status};
use oxideterm_remote_desktop::{
    RemoteDesktopCursorShape, RemoteDesktopEndpoint, RemoteDesktopErrorCategory,
    RemoteDesktopFakeBackend, RemoteDesktopFrame, RemoteDesktopFrameFormat,
    RemoteDesktopFrameUpdate, RemoteDesktopHelperEvent, RemoteDesktopHelperRequest,
    RemoteDesktopKey, RemoteDesktopKeyState, RemoteDesktopMouseButton,
    RemoteDesktopMouseButtonState, RemoteDesktopProtocol, RemoteDesktopRect, RemoteDesktopSecret,
    RemoteDesktopSessionStatus, RemoteDesktopSize, RemoteDesktopWheelDelta, read_request_line,
    run_fake_backend_stdio, write_event_line,
};
use zeroize::Zeroizing;

const VNC_PROTOCOL_VERSION_33: &[u8; 12] = b"RFB 003.003\n";
const VNC_PROTOCOL_VERSION_38: &[u8; 12] = b"RFB 003.008\n";
const VNC_SECURITY_NONE: u8 = 1;
const VNC_SECURITY_VNC_AUTH: u8 = 2;
const VNC_ENCODING_RAW: i32 = 0;
const VNC_ENCODING_COPY_RECT: i32 = 1;
const VNC_ENCODING_HEXTILE: i32 = 5;
const VNC_ENCODING_ZRLE: i32 = 16;
const VNC_ENCODING_DESKTOP_SIZE: i32 = -223;
const VNC_ENCODING_CURSOR: i32 = -239;
const VNC_ENCODING_X_CURSOR: i32 = -240;
const VNC_ADVERTISED_ENCODINGS: [i32; 7] = [
    VNC_ENCODING_DESKTOP_SIZE,
    VNC_ENCODING_CURSOR,
    VNC_ENCODING_X_CURSOR,
    VNC_ENCODING_COPY_RECT,
    VNC_ENCODING_ZRLE,
    VNC_ENCODING_HEXTILE,
    VNC_ENCODING_RAW,
];
const VNC_HEXTILE_TILE_SIZE: u16 = 16;
const VNC_HEXTILE_RAW: u8 = 1;
const VNC_HEXTILE_BACKGROUND_SPECIFIED: u8 = 2;
const VNC_HEXTILE_FOREGROUND_SPECIFIED: u8 = 4;
const VNC_HEXTILE_ANY_SUBRECTS: u8 = 8;
const VNC_HEXTILE_SUBRECTS_COLORED: u8 = 16;
const VNC_ZRLE_TILE_SIZE: u16 = 64;
const VNC_TRLE_RAW: u8 = 0;
const VNC_TRLE_SOLID: u8 = 1;
const VNC_TRLE_PLAIN_RLE: u8 = 128;
const VNC_BUTTON_LEFT: u8 = 1;
const VNC_BUTTON_MIDDLE: u8 = 2;
const VNC_BUTTON_RIGHT: u8 = 4;
const VNC_WHEEL_UP: u8 = 8;
const VNC_WHEEL_DOWN: u8 = 16;
const VNC_WHEEL_LEFT: u8 = 32;
const VNC_WHEEL_RIGHT: u8 = 64;
const VNC_SCROLL_STEP: f32 = 120.0;
const REMOTE_DESKTOP_DIAGNOSTICS_ENV: &str = "OXIDETERM_REMOTE_DESKTOP_DIAGNOSTICS";
const MAX_VNC_FRAME_BYTES: usize =
    RemoteDesktopSize::MAX_DIMENSION as usize * RemoteDesktopSize::MAX_DIMENSION as usize * 4;

type SharedEventWriter = Arc<Mutex<io::Stdout>>;
type SharedVncWriter = Arc<Mutex<TcpStream>>;

struct VncSessionConfig {
    endpoint: RemoteDesktopEndpoint,
    password: Option<RemoteDesktopSecret>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum VncRequestAction {
    Continue,
    Close,
    Reconnect,
}

#[derive(Clone, Copy, Debug, Default)]
struct VncDiagnostics {
    // Diagnostics stay opt-in because helper stderr can be collected by parent
    // processes and must never include user payloads by default.
    enabled: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum VncProtocolVersion {
    Rfb003003,
    Rfb003008,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum VncSecuritySelection {
    None,
    VncAuth,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct VncHandshakeInfo {
    protocol_version: VncProtocolVersion,
    security: VncSecuritySelection,
    legacy_security: bool,
}

#[derive(Default)]
struct VncReaderDiagnosticsCounters {
    // These counters intentionally track protocol volume, not frame bytes or
    // clipboard contents.
    server_messages: u64,
    helper_frames: u64,
    helper_frame_updates: u64,
    helper_side_events: u64,
    dirty_rects: u64,
    dirty_pixels: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct VncServerEventSummary {
    // The summary is safe for logs: it records counts and areas only.
    dirty_rects: u64,
    dirty_pixels: u64,
    side_events: u64,
}

impl VncDiagnostics {
    fn from_env() -> Self {
        Self {
            enabled: std::env::var_os(REMOTE_DESKTOP_DIAGNOSTICS_ENV).is_some(),
        }
    }

    fn log(&self, message: impl AsRef<str>) {
        if self.enabled {
            eprintln!("[oxideterm:vnc-helper] {}", message.as_ref());
        }
    }
}

impl VncProtocolVersion {
    fn as_str(self) -> &'static str {
        match self {
            Self::Rfb003003 => "RFB 003.003",
            Self::Rfb003008 => "RFB 003.008",
        }
    }
}

impl VncSecuritySelection {
    fn code(self) -> u8 {
        match self {
            Self::None => VNC_SECURITY_NONE,
            Self::VncAuth => VNC_SECURITY_VNC_AUTH,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::VncAuth => "vnc-auth",
        }
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("oxideterm-vnc-helper: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if !args.iter().any(|arg| arg == "--stdio") {
        return Err("pass --stdio to run the helper protocol boundary".to_string());
    }

    let stdin = io::stdin();
    let mut reader = io::BufReader::new(stdin.lock());
    if args.iter().any(|arg| arg == "--fake") {
        let stdout = io::stdout();
        let mut writer = stdout.lock();
        let mut backend = RemoteDesktopFakeBackend::new(RemoteDesktopProtocol::Vnc);

        // The fake backend stays available for preview and deterministic tests.
        run_fake_backend_stdio(&mut backend, &mut reader, &mut writer)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    run_real_vnc_stdio(&mut reader)
}

fn run_real_vnc_stdio(reader: &mut impl BufRead) -> Result<(), String> {
    let writer = Arc::new(Mutex::new(io::stdout()));
    let diagnostics = VncDiagnostics::from_env();
    let Some(first_request) = read_request_line(reader).map_err(|error| error.to_string())? else {
        return Ok(());
    };
    let RemoteDesktopHelperRequest::Connect {
        protocol,
        endpoint,
        username: _username,
        password,
        domain: _domain,
        size: _size,
        scale_factor: _scale_factor,
        read_only,
    } = first_request
    else {
        send_event(
            &writer,
            RemoteDesktopHelperEvent::ConnectionFailure {
                message: "VNC helper expected an initial connect request.".to_string(),
                category: Some(RemoteDesktopErrorCategory::Configuration),
            },
        )?;
        return Ok(());
    };

    if protocol != RemoteDesktopProtocol::Vnc {
        send_event(
            &writer,
            RemoteDesktopHelperEvent::ConnectionFailure {
                message: "VNC helper received a non-VNC connect request.".to_string(),
                category: Some(RemoteDesktopErrorCategory::Configuration),
            },
        )?;
        return Ok(());
    }

    send_event(
        &writer,
        RemoteDesktopHelperEvent::Status {
            status: RemoteDesktopSessionStatus::Connecting,
            message: Some("Opening VNC session.".to_string()),
        },
    )?;

    let session_config = VncSessionConfig { endpoint, password };
    let mut reconnect_count = 0_u64;
    diagnostics.log(format!(
        "connect attempt reconnects=0 read_only={read_only}"
    ));
    let mut connection = match VncConnection::connect(&session_config, writer.clone(), diagnostics)
    {
        Ok(connection) => connection,
        Err(error) => {
            diagnostics.log(format!(
                "connect failed reconnects=0 category={:?}",
                vnc_error_category_from_message(&error)
            ));
            send_event(
                &writer,
                RemoteDesktopHelperEvent::ConnectionFailure {
                    category: Some(vnc_error_category_from_message(&error)),
                    message: error,
                },
            )?;
            return Ok(());
        }
    };

    send_event(
        &writer,
        RemoteDesktopHelperEvent::Connected {
            size: RemoteDesktopSize {
                width: connection.width as u32,
                height: connection.height as u32,
            },
        },
    )?;
    diagnostics.log(format!(
        "connect ok reconnects=0 framebuffer={}x{}",
        connection.width, connection.height
    ));
    connection.start_reader();
    connection.request_framebuffer_update(false)?;

    let mut input_state = VncInputState::default();
    while let Some(request) = read_request_line(reader).map_err(|error| error.to_string())? {
        match handle_real_vnc_request(
            &writer,
            &mut connection,
            &mut input_state,
            request,
            read_only,
        )? {
            VncRequestAction::Continue => {}
            VncRequestAction::Close => break,
            VncRequestAction::Reconnect => {
                send_event(
                    &writer,
                    RemoteDesktopHelperEvent::Status {
                        status: RemoteDesktopSessionStatus::Reconnecting,
                        message: Some("Reopening VNC session.".to_string()),
                    },
                )?;
                connection.shutdown();
                input_state = VncInputState::default();
                reconnect_count = reconnect_count.saturating_add(1);
                diagnostics.log(format!(
                    "connect attempt reconnects={reconnect_count} read_only={read_only}"
                ));
                connection =
                    match VncConnection::connect(&session_config, writer.clone(), diagnostics) {
                        Ok(connection) => connection,
                        Err(error) => {
                            diagnostics.log(format!(
                                "connect failed reconnects={reconnect_count} category={:?}",
                                vnc_error_category_from_message(&error)
                            ));
                            send_event(
                                &writer,
                                RemoteDesktopHelperEvent::ConnectionFailure {
                                    category: Some(vnc_error_category_from_message(&error)),
                                    message: error,
                                },
                            )?;
                            break;
                        }
                    };
                send_event(
                    &writer,
                    RemoteDesktopHelperEvent::Connected {
                        size: RemoteDesktopSize {
                            width: connection.width as u32,
                            height: connection.height as u32,
                        },
                    },
                )?;
                diagnostics.log(format!(
                    "connect ok reconnects={reconnect_count} framebuffer={}x{}",
                    connection.width, connection.height
                ));
                connection.start_reader();
                connection.request_framebuffer_update(false)?;
            }
        }
    }

    connection.shutdown();
    send_event(
        &writer,
        RemoteDesktopHelperEvent::Disconnected {
            reason: Some("VNC session closed.".to_string()),
        },
    )?;
    Ok(())
}

fn handle_real_vnc_request(
    event_writer: &SharedEventWriter,
    connection: &mut VncConnection,
    input_state: &mut VncInputState,
    request: RemoteDesktopHelperRequest,
    read_only: bool,
) -> Result<VncRequestAction, String> {
    match request {
        RemoteDesktopHelperRequest::Close => return Ok(VncRequestAction::Close),
        RemoteDesktopHelperRequest::Reconnect => {
            return Ok(VncRequestAction::Reconnect);
        }
        RemoteDesktopHelperRequest::Resize { .. } => {
            // RFB clients cannot resize arbitrary servers unless the server
            // advertises a resize extension. The first helper slice keeps this
            // as a no-op instead of lying about server-side support.
        }
        RemoteDesktopHelperRequest::Connect { .. } => {
            return Err("VNC helper received a second connect request.".to_string());
        }
        RemoteDesktopHelperRequest::MouseMove { x, y } if !read_only => {
            input_state.pointer.x = clamp_u32_to_u16(x);
            input_state.pointer.y = clamp_u32_to_u16(y);
            connection.send_pointer(
                input_state.pointer.x,
                input_state.pointer.y,
                input_state.pointer.buttons,
            )?;
            send_event(
                event_writer,
                RemoteDesktopHelperEvent::Cursor {
                    x: u32::from(input_state.pointer.x),
                    y: u32::from(input_state.pointer.y),
                    width: 0,
                    height: 0,
                },
            )?;
        }
        RemoteDesktopHelperRequest::MouseButton { button, state } if !read_only => {
            let mask = vnc_button_mask(button);
            match state {
                RemoteDesktopMouseButtonState::Pressed => input_state.pointer.buttons |= mask,
                RemoteDesktopMouseButtonState::Released => input_state.pointer.buttons &= !mask,
            }
            connection.send_pointer(
                input_state.pointer.x,
                input_state.pointer.y,
                input_state.pointer.buttons,
            )?;
        }
        RemoteDesktopHelperRequest::Wheel { delta } if !read_only => {
            for mask in vnc_scroll_masks(delta) {
                connection.send_pointer(
                    input_state.pointer.x,
                    input_state.pointer.y,
                    input_state.pointer.buttons | mask,
                )?;
                connection.send_pointer(
                    input_state.pointer.x,
                    input_state.pointer.y,
                    input_state.pointer.buttons,
                )?;
            }
        }
        RemoteDesktopHelperRequest::Key { key, state } if !read_only => {
            for event in input_state.keyboard.operations(&key, state) {
                connection.send_key(event.keysym, event.down)?;
            }
        }
        RemoteDesktopHelperRequest::Text { text } if !read_only => {
            for character in text.chars().filter(|character| !character.is_control()) {
                let keysym = character as u32;
                connection.send_key(keysym, true)?;
                connection.send_key(keysym, false)?;
            }
        }
        RemoteDesktopHelperRequest::ClipboardText { text } if !read_only => {
            connection.send_client_cut_text(&text)?;
        }
        RemoteDesktopHelperRequest::ClipboardData { .. } => {
            // Baseline RFB clipboard messages are text-only. Keep binary
            // clipboard data as an RDP capability unless a VNC extension is
            // negotiated explicitly.
        }
        RemoteDesktopHelperRequest::SynchronizeLockKeys { .. } => {
            // RFB has no equivalent lock-key synchronization message in the
            // baseline protocol, so this request is RDP-only.
        }
        RemoteDesktopHelperRequest::RequestFrame => {
            connection.request_full_frame_recovery()?;
        }
        RemoteDesktopHelperRequest::ReleaseAllInputs if !read_only => {
            if input_state.pointer.buttons != 0 {
                input_state.pointer.buttons = 0;
                connection.send_pointer(input_state.pointer.x, input_state.pointer.y, 0)?;
            }
            for event in input_state.keyboard.release_all_events() {
                connection.send_key(event.keysym, event.down)?;
            }
        }
        _ => {}
    }

    Ok(VncRequestAction::Continue)
}

#[derive(Default)]
struct VncInputState {
    pointer: VncPointerState,
    keyboard: VncKeyboardInputMapper,
}

#[derive(Default)]
struct VncPointerState {
    x: u16,
    y: u16,
    buttons: u8,
}

struct VncConnection {
    writer: SharedVncWriter,
    reader: Option<TcpStream>,
    event_writer: SharedEventWriter,
    diagnostics: VncDiagnostics,
    closed: Arc<AtomicBool>,
    session_state: Arc<VncSessionSharedState>,
    width: u16,
    height: u16,
}

struct VncSessionSharedState {
    width: AtomicU16,
    height: AtomicU16,
    force_next_base_frame: AtomicBool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RfbRect {
    x: u16,
    y: u16,
    width: u16,
    height: u16,
}

#[derive(Debug, PartialEq)]
enum VncServerEvent {
    SetResolution {
        width: u16,
        height: u16,
    },
    RawImage(RfbRect, Vec<u8>),
    CopyRect {
        dst: RfbRect,
        src_x: u16,
        src_y: u16,
    },
    ClipboardText(String),
    CursorShape(RemoteDesktopCursorShape),
    CursorHidden,
    Batch(Vec<VncServerEvent>),
    Noop,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum VncFramebufferChange {
    Full,
    Rect(RfbRect),
}

struct VncFramebuffer {
    width: u32,
    height: u32,
    bgra: Vec<u8>,
}

impl VncFramebuffer {
    fn new(width: u16, height: u16) -> Self {
        let width = width as u32;
        let height = height as u32;
        Self {
            width,
            height,
            bgra: opaque_bgra_buffer(width, height),
        }
    }

    fn apply(&mut self, event: VncServerEvent) -> Option<VncFramebufferChange> {
        match event {
            VncServerEvent::SetResolution { width, height } => {
                self.width = width as u32;
                self.height = height as u32;
                self.bgra = opaque_bgra_buffer(self.width, self.height);
                Some(VncFramebufferChange::Full)
            }
            VncServerEvent::RawImage(rect, data) => self.draw_rect(rect, &data),
            VncServerEvent::CopyRect { dst, src_x, src_y } => self.copy_rect(dst, src_x, src_y),
            VncServerEvent::Batch(events) => {
                let mut change = None;
                for event in events {
                    change = merge_vnc_framebuffer_change(change, self.apply(event));
                }
                change
            }
            VncServerEvent::ClipboardText(_)
            | VncServerEvent::CursorShape(_)
            | VncServerEvent::CursorHidden
            | VncServerEvent::Noop => None,
        }
    }

    fn frame(&self) -> RemoteDesktopFrame {
        RemoteDesktopFrame::new(
            RemoteDesktopSize {
                width: self.width,
                height: self.height,
            },
            RemoteDesktopFrameFormat::Bgra8,
            self.bgra.clone(),
        )
    }

    fn frame_update(&self, rect: RfbRect) -> Option<RemoteDesktopFrameUpdate> {
        let rect = self.clipped_rect(rect)?;
        let bytes = self.rect_bytes(rect)?;
        Some(RemoteDesktopFrameUpdate::new(
            RemoteDesktopSize {
                width: self.width,
                height: self.height,
            },
            RemoteDesktopRect::new(
                rect.x as u32,
                rect.y as u32,
                rect.width as u32,
                rect.height as u32,
            ),
            RemoteDesktopFrameFormat::Bgra8,
            bytes,
        ))
    }

    fn draw_rect(&mut self, rect: RfbRect, data: &[u8]) -> Option<VncFramebufferChange> {
        if self.width == 0 || self.height == 0 {
            return None;
        }
        let clipped = self.clipped_rect(rect)?;
        let needed = rect.width as usize * rect.height as usize * 4;
        if data.len() < needed {
            return None;
        }

        for y in 0..u32::from(clipped.height) {
            let src_y = u32::from(clipped.y - rect.y) + y;
            let src_start =
                ((src_y * u32::from(rect.width) + u32::from(clipped.x - rect.x)) * 4) as usize;
            let src_end = src_start + (u32::from(clipped.width) * 4) as usize;
            let dst_start =
                (((u32::from(clipped.y) + y) * self.width + u32::from(clipped.x)) * 4) as usize;
            let dst_end = dst_start + (u32::from(clipped.width) * 4) as usize;
            let dst_row = &mut self.bgra[dst_start..dst_end];
            dst_row.copy_from_slice(&data[src_start..src_end]);
            set_bgra_alpha_opaque(dst_row);
        }
        Some(VncFramebufferChange::Rect(clipped))
    }

    fn copy_rect(&mut self, dst: RfbRect, src_x: u16, src_y: u16) -> Option<VncFramebufferChange> {
        if self.width == 0 || self.height == 0 || dst.width == 0 || dst.height == 0 {
            return None;
        }
        let copy_w = dst.width as u32;
        let copy_h = dst.height as u32;
        let src_x = src_x as u32;
        let src_y = src_y as u32;
        let dst_x = dst.x as u32;
        let dst_y = dst.y as u32;
        if src_x >= self.width
            || src_y >= self.height
            || dst_x >= self.width
            || dst_y >= self.height
        {
            return None;
        }
        let copy_w = copy_w.min(self.width - src_x).min(self.width - dst_x);
        let copy_h = copy_h.min(self.height - src_y).min(self.height - dst_y);
        if copy_w == 0 || copy_h == 0 {
            return None;
        }
        let mut scratch = vec![0; copy_w as usize * copy_h as usize * 4];
        for y in 0..copy_h {
            let src_start = (((src_y + y) * self.width + src_x) * 4) as usize;
            let src_end = src_start + (copy_w * 4) as usize;
            let tmp_start = (y * copy_w * 4) as usize;
            let tmp_end = tmp_start + (copy_w * 4) as usize;
            scratch[tmp_start..tmp_end].copy_from_slice(&self.bgra[src_start..src_end]);
        }
        for y in 0..copy_h {
            let tmp_start = (y * copy_w * 4) as usize;
            let tmp_end = tmp_start + (copy_w * 4) as usize;
            let dst_start = (((dst_y + y) * self.width + dst_x) * 4) as usize;
            let dst_end = dst_start + (copy_w * 4) as usize;
            self.bgra[dst_start..dst_end].copy_from_slice(&scratch[tmp_start..tmp_end]);
        }
        Some(VncFramebufferChange::Rect(RfbRect {
            x: dst.x,
            y: dst.y,
            width: copy_w as u16,
            height: copy_h as u16,
        }))
    }

    fn clipped_rect(&self, rect: RfbRect) -> Option<RfbRect> {
        let rect_x = u32::from(rect.x);
        let rect_y = u32::from(rect.y);
        let rect_w = u32::from(rect.width);
        let rect_h = u32::from(rect.height);
        if rect_x >= self.width || rect_y >= self.height || rect_w == 0 || rect_h == 0 {
            return None;
        }
        Some(RfbRect {
            x: rect.x,
            y: rect.y,
            width: rect_w.min(self.width - rect_x) as u16,
            height: rect_h.min(self.height - rect_y) as u16,
        })
    }

    fn rect_bytes(&self, rect: RfbRect) -> Option<Vec<u8>> {
        let rect = self.clipped_rect(rect)?;
        let width = usize::from(rect.width);
        let height = usize::from(rect.height);
        let mut bytes = vec![0; width.checked_mul(height)?.checked_mul(4)?];
        for y in 0..height {
            let src_start =
                ((usize::from(rect.y) + y) * self.width as usize + usize::from(rect.x)) * 4;
            let src_end = src_start + width * 4;
            let dst_start = y * width * 4;
            let dst_end = dst_start + width * 4;
            bytes[dst_start..dst_end].copy_from_slice(&self.bgra[src_start..src_end]);
        }
        Some(bytes)
    }
}

fn opaque_bgra_buffer(width: u32, height: u32) -> Vec<u8> {
    let len = width as usize * height as usize * 4;
    let mut bytes = vec![0; len];
    set_bgra_alpha_opaque(&mut bytes);
    bytes
}

fn set_bgra_alpha_opaque(bytes: &mut [u8]) {
    for pixel in bytes.chunks_exact_mut(4) {
        // VNC requests 32-bit/24-depth true color, so the fourth byte is
        // transport padding rather than framebuffer transparency.
        pixel[3] = 0xff;
    }
}

fn merge_vnc_framebuffer_change(
    existing: Option<VncFramebufferChange>,
    incoming: Option<VncFramebufferChange>,
) -> Option<VncFramebufferChange> {
    match (existing, incoming) {
        (Some(VncFramebufferChange::Full), _) | (_, Some(VncFramebufferChange::Full)) => {
            Some(VncFramebufferChange::Full)
        }
        (Some(VncFramebufferChange::Rect(left)), Some(VncFramebufferChange::Rect(right))) => {
            union_rfb_rect(left, right).map(VncFramebufferChange::Rect)
        }
        (Some(change), None) | (None, Some(change)) => Some(change),
        (None, None) => None,
    }
}

fn union_rfb_rect(left: RfbRect, right: RfbRect) -> Option<RfbRect> {
    let x = left.x.min(right.x);
    let y = left.y.min(right.y);
    let right_edge = u32::from(left.x)
        .checked_add(u32::from(left.width))?
        .max(u32::from(right.x).checked_add(u32::from(right.width))?);
    let bottom_edge = u32::from(left.y)
        .checked_add(u32::from(left.height))?
        .max(u32::from(right.y).checked_add(u32::from(right.height))?);
    Some(RfbRect {
        x,
        y,
        width: right_edge.checked_sub(u32::from(x))?.min(u16::MAX as u32) as u16,
        height: bottom_edge.checked_sub(u32::from(y))?.min(u16::MAX as u32) as u16,
    })
}

mod connection;
mod decode;
mod input;
mod protocol;

use connection::*;
use decode::*;
use input::*;
use protocol::*;

#[cfg(test)]
mod tests;
