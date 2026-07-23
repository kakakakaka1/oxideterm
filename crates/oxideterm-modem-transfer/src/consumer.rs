// Copyright (C) 2026 OxideTerm contributors.
// SPDX-License-Identifier: GPL-3.0-only

use crate::detector::{DetectedModemProtocol, ModemDetector};
use crate::stream::{ModemTransfer, ModemWakeCallback};
use crate::zmodem::ZFrameType;
use crate::zmodem_transfer::parse_zmodem_header_prefix;
use std::fmt;

const PLAIN_HISTORY_LIMIT: usize = 512;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModemTransferDirection {
    Upload,
    Download,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModemTransferRequest {
    pub protocol: DetectedModemProtocol,
    pub direction: ModemTransferDirection,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModemConsumerEvent {
    WriteTerminal(Vec<u8>),
    SendServer(Vec<u8>),
    TransferStarted(ModemTransferRequest),
    TransferDataQueued,
    TransferCancelRequested,
}

pub struct ModemConsumer {
    plain_tail: Vec<u8>,
    detection_tail: Vec<u8>,
    plain_history: Vec<u8>,
    detection_scope: ModemDetectionScope,
    pending: Option<PendingTransfer>,
    transfer: Option<ModemTransfer>,
    transfer_input: Option<ModemTransfer>,
    wake_host: Option<ModemWakeCallback>,
}

impl fmt::Debug for ModemConsumer {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ModemConsumer")
            .field("plain_tail_len", &self.plain_tail.len())
            .field("detection_tail_len", &self.detection_tail.len())
            .field("plain_history_len", &self.plain_history.len())
            .field("pending", &self.pending)
            .field("has_transfer", &self.transfer.is_some())
            .field("has_transfer_input", &self.transfer_input.is_some())
            .finish_non_exhaustive()
    }
}

#[derive(Debug)]
struct PendingTransfer {
    protocol: DetectedModemProtocol,
    bytes: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TerminalControlStringKind {
    Osc,
    Dcs,
    Apc,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
enum ModemDetectionScope {
    #[default]
    Ground,
    Escape,
    ControlString {
        kind: TerminalControlStringKind,
        escape_pending: bool,
    },
}

impl ModemDetectionScope {
    fn mask_control_strings(&mut self, bytes: &[u8]) -> Vec<u8> {
        // Spaces preserve text-token boundaries without allowing binary image
        // payload bytes to participate in modem marker or command detection.
        const MASKED_BYTE: u8 = b' ';

        bytes
            .iter()
            .map(|byte| {
                let byte = *byte;
                match *self {
                    Self::Ground => match byte {
                        0x1b => {
                            *self = Self::Escape;
                            MASKED_BYTE
                        }
                        0x90 => {
                            *self = Self::control_string(TerminalControlStringKind::Dcs);
                            MASKED_BYTE
                        }
                        0x9d => {
                            *self = Self::control_string(TerminalControlStringKind::Osc);
                            MASKED_BYTE
                        }
                        0x9f => {
                            *self = Self::control_string(TerminalControlStringKind::Apc);
                            MASKED_BYTE
                        }
                        _ => byte,
                    },
                    Self::Escape => match byte {
                        b']' => {
                            *self = Self::control_string(TerminalControlStringKind::Osc);
                            MASKED_BYTE
                        }
                        b'P' => {
                            *self = Self::control_string(TerminalControlStringKind::Dcs);
                            MASKED_BYTE
                        }
                        b'_' => {
                            *self = Self::control_string(TerminalControlStringKind::Apc);
                            MASKED_BYTE
                        }
                        0x1b => MASKED_BYTE,
                        _ => {
                            *self = Self::Ground;
                            byte
                        }
                    },
                    Self::ControlString {
                        kind,
                        escape_pending,
                    } => {
                        let terminated_by_bel =
                            kind == TerminalControlStringKind::Osc && byte == 0x07;
                        if terminated_by_bel || byte == 0x9c || (escape_pending && byte == b'\\') {
                            *self = Self::Ground;
                        } else {
                            *self = Self::ControlString {
                                kind,
                                escape_pending: byte == 0x1b,
                            };
                        }
                        MASKED_BYTE
                    }
                }
            })
            .collect()
    }

    const fn control_string(kind: TerminalControlStringKind) -> Self {
        Self::ControlString {
            kind,
            escape_pending: false,
        }
    }

    fn reset(&mut self) {
        *self = Self::Ground;
    }
}

impl Default for ModemConsumer {
    fn default() -> Self {
        Self::new()
    }
}

impl ModemConsumer {
    pub fn new() -> Self {
        Self {
            plain_tail: Vec::new(),
            detection_tail: Vec::new(),
            plain_history: Vec::new(),
            detection_scope: ModemDetectionScope::default(),
            pending: None,
            transfer: None,
            transfer_input: None,
            wake_host: None,
        }
    }

    pub fn with_wake(wake_host: ModemWakeCallback) -> Self {
        Self {
            wake_host: Some(wake_host),
            ..Self::new()
        }
    }

    pub fn active_transfer(&self) -> Option<&ModemTransfer> {
        self.transfer.as_ref()
    }

    pub fn take_active_transfer(&mut self) -> Option<ModemTransfer> {
        self.transfer.take()
    }

    pub fn start_manual_transfer(
        &mut self,
        request: ModemTransferRequest,
    ) -> Option<ModemTransfer> {
        if self.transfer.is_some() {
            return None;
        }
        Some(self.start_transfer(&[], request))
    }

    pub fn finish_transfer(&mut self) {
        self.transfer = None;
        self.transfer_input = None;
        self.pending = None;
        self.plain_tail.clear();
        self.detection_tail.clear();
        self.detection_scope.reset();
    }

    pub fn interrupt_transfer(&mut self) {
        if let Some(transfer) = &self.transfer {
            transfer.stop();
        }
        if let Some(input) = &self.transfer_input {
            input.stop();
        }
        self.finish_transfer();
    }

    pub fn take_server_writes(&mut self) -> Vec<Vec<u8>> {
        self.transfer_input
            .as_ref()
            .map(ModemTransfer::take_server_writes)
            .unwrap_or_default()
    }

    pub fn process_server_output(&mut self, bytes: &[u8]) -> Vec<ModemConsumerEvent> {
        if bytes.is_empty() {
            return Vec::new();
        }

        if let Some(input) = &self.transfer_input {
            input.push_remote_output(bytes);
            return vec![ModemConsumerEvent::TransferDataQueued];
        }

        if self.pending.is_some() {
            return self.process_pending_server_output(bytes);
        }

        let masked_bytes = self.detection_scope.mask_control_strings(bytes);
        let mut scan_bytes = Vec::with_capacity(self.plain_tail.len() + bytes.len());
        scan_bytes.extend_from_slice(&self.plain_tail);
        scan_bytes.extend_from_slice(bytes);
        self.plain_tail.clear();
        let mut detection_bytes =
            Vec::with_capacity(self.detection_tail.len() + masked_bytes.len());
        detection_bytes.extend_from_slice(&self.detection_tail);
        detection_bytes.extend_from_slice(&masked_bytes);
        self.detection_tail.clear();

        let mut detector = ModemDetector::new();
        let Some(start) = detector.scan_first(&detection_bytes) else {
            let hold = possible_modem_prefix_suffix_len(&detection_bytes);
            if hold == scan_bytes.len() {
                self.plain_tail = scan_bytes;
                self.detection_tail = detection_bytes;
                return Vec::new();
            }
            let split = scan_bytes.len() - hold;
            self.plain_tail.extend_from_slice(&scan_bytes[split..]);
            self.detection_tail
                .extend_from_slice(&detection_bytes[split..]);
            self.remember_plain_output(&detection_bytes[..split]);
            return vec![ModemConsumerEvent::WriteTerminal(
                scan_bytes[..split].to_vec(),
            )];
        };

        let mut events = Vec::new();
        if start.offset > 0 {
            self.remember_plain_output(&detection_bytes[..start.offset]);
            events.push(ModemConsumerEvent::WriteTerminal(
                scan_bytes[..start.offset].to_vec(),
            ));
        }

        let protocol_bytes = &scan_bytes[start.offset..];
        if let Some(request) =
            request_for_protocol(start.protocol, protocol_bytes, &self.plain_history)
        {
            self.start_transfer(protocol_bytes, request.clone());
            events.push(ModemConsumerEvent::TransferStarted(request));
        } else if should_wait_for_protocol_confirmation(start.protocol, protocol_bytes) {
            self.pending = Some(PendingTransfer {
                protocol: start.protocol,
                bytes: protocol_bytes.to_vec(),
            });
        } else {
            self.remember_plain_output(protocol_bytes);
            events.push(ModemConsumerEvent::WriteTerminal(protocol_bytes.to_vec()));
        }

        events
    }

    fn process_pending_server_output(&mut self, bytes: &[u8]) -> Vec<ModemConsumerEvent> {
        let mut pending = self.pending.take().expect("pending transfer");
        pending.bytes.extend_from_slice(bytes);
        if let Some(request) =
            request_for_protocol(pending.protocol, &pending.bytes, &self.plain_history)
        {
            let initial = pending.bytes;
            self.start_transfer(&initial, request.clone());
            vec![ModemConsumerEvent::TransferStarted(request)]
        } else if should_wait_for_protocol_confirmation(pending.protocol, &pending.bytes) {
            self.pending = Some(pending);
            Vec::new()
        } else {
            let plain = pending.bytes;
            self.remember_plain_output(&plain);
            vec![ModemConsumerEvent::WriteTerminal(plain)]
        }
    }

    fn start_transfer(
        &mut self,
        initial_bytes: &[u8],
        request: ModemTransferRequest,
    ) -> ModemTransfer {
        let transfer = ModemTransfer::new_with_wake(initial_bytes, self.wake_host.clone());
        self.transfer_input = Some(transfer.clone());
        self.transfer = Some(transfer.clone());
        let _ = request;
        transfer
    }

    fn remember_plain_output(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            return;
        }
        self.plain_history.extend_from_slice(bytes);
        if self.plain_history.len() > PLAIN_HISTORY_LIMIT {
            let discard = self.plain_history.len() - PLAIN_HISTORY_LIMIT;
            self.plain_history.drain(..discard);
        }
    }
}

fn request_for_protocol(
    protocol: DetectedModemProtocol,
    bytes: &[u8],
    plain_history: &[u8],
) -> Option<ModemTransferRequest> {
    let (protocol, direction) = match protocol {
        DetectedModemProtocol::Zmodem => match parse_zmodem_header_prefix(bytes).ok().flatten()? {
            header if header.frame_type == ZFrameType::ZrInit => {
                (protocol, ModemTransferDirection::Upload)
            }
            header
                if matches!(
                    header.frame_type,
                    ZFrameType::ZrqInit | ZFrameType::ZFile | ZFrameType::ZData
                ) =>
            {
                (protocol, ModemTransferDirection::Download)
            }
            _ => (protocol, ModemTransferDirection::Download),
        },
        DetectedModemProtocol::XymodemNegotiation => {
            let protocol = xymodem_negotiation_protocol_hint(plain_history)?;
            (protocol, ModemTransferDirection::Upload)
        }
        DetectedModemProtocol::Xmodem | DetectedModemProtocol::Ymodem => {
            (protocol, ModemTransferDirection::Download)
        }
    };
    Some(ModemTransferRequest {
        protocol,
        direction,
    })
}

fn should_wait_for_protocol_confirmation(protocol: DetectedModemProtocol, bytes: &[u8]) -> bool {
    // Only framed ZMODEM headers have enough structure to justify holding output
    // while waiting for more bytes; lone X/YMODEM negotiation bytes are common text.
    matches!(protocol, DetectedModemProtocol::Zmodem)
        && matches!(parse_zmodem_header_prefix(bytes), Ok(None))
}

fn xymodem_negotiation_protocol_hint(plain_history: &[u8]) -> Option<DetectedModemProtocol> {
    let text = String::from_utf8_lossy(plain_history);
    text.lines().rev().take(4).find_map(|line| {
        line.split_whitespace().find_map(|token| {
            let command = token
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or(token)
                .trim_matches(|ch: char| !ch.is_ascii_alphanumeric() && ch != '-' && ch != '_');
            match command {
                "rx" => Some(DetectedModemProtocol::Xmodem),
                "rb" => Some(DetectedModemProtocol::Ymodem),
                _ => None,
            }
        })
    })
}

fn possible_modem_prefix_suffix_len(bytes: &[u8]) -> usize {
    const PREFIXES: [&[u8]; 6] = [
        &[crate::zmodem::ZPAD],
        &[crate::zmodem::ZPAD, crate::zmodem::ZPAD],
        &[
            crate::zmodem::ZPAD,
            crate::zmodem::ZPAD,
            crate::zmodem::ZDLE,
        ],
        &[crate::zmodem::ZPAD, crate::zmodem::ZDLE],
        &[crate::xymodem::SOH],
        &[crate::xymodem::STX],
    ];
    PREFIXES
        .iter()
        .filter(|prefix| bytes.ends_with(prefix))
        .map(|prefix| prefix.len())
        .max()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zmodem::{ZFrameType, encode_hex_header, position_header};

    #[test]
    fn zmodem_download_detection_swallows_protocol_bytes() {
        let mut consumer = ModemConsumer::new();
        let mut bytes = b"visible".to_vec();
        bytes.extend(encode_hex_header(
            ZFrameType::ZrqInit,
            position_header(0),
            true,
        ));
        let events = consumer.process_server_output(&bytes);
        assert!(matches!(
            events.as_slice(),
            [
                ModemConsumerEvent::WriteTerminal(_),
                ModemConsumerEvent::TransferStarted(ModemTransferRequest {
                    protocol: DetectedModemProtocol::Zmodem,
                    direction: ModemTransferDirection::Download
                })
            ]
        ));
        assert!(consumer.active_transfer().is_some());
    }

    #[test]
    fn zmodem_upload_detection_waits_until_header_is_complete() {
        let mut consumer = ModemConsumer::new();
        assert!(consumer.process_server_output(&[b'*', b'*']).is_empty());
        let events = consumer.process_server_output(&[0x18, b'B', b'0']);
        assert!(events.is_empty());
    }

    #[test]
    fn zmodem_headers_inside_split_graphics_payloads_are_plain_terminal_output() {
        assert_graphics_payload_is_plain_terminal_output(b"\x1bPq\"1;1;1;1", b"\x1b\\");
        assert_graphics_payload_is_plain_terminal_output(b"\x1b_Gf=100;", b"\x1b\\");
        assert_graphics_payload_is_plain_terminal_output(b"\x1b]1337;File=name=test:", b"\x07");
    }

    #[test]
    fn zmodem_detection_resumes_after_graphics_payload_terminator() {
        let mut consumer = ModemConsumer::new();
        let _ = consumer.process_server_output(b"\x1bPqpreview\x1b\\");
        let header = encode_hex_header(ZFrameType::ZrqInit, position_header(0), true);
        let events = consumer.process_server_output(&header);

        assert!(events.iter().any(|event| matches!(
            event,
            ModemConsumerEvent::TransferStarted(ModemTransferRequest {
                protocol: DetectedModemProtocol::Zmodem,
                direction: ModemTransferDirection::Download
            })
        )));
    }

    #[test]
    fn xymodem_command_hints_inside_graphics_payloads_are_ignored() {
        let mut consumer = ModemConsumer::new();
        let _ = consumer.process_server_output(b"\x1bPq rx \x1b\\");
        let events = consumer.process_server_output(b"C");

        assert_eq!(
            events,
            vec![ModemConsumerEvent::WriteTerminal(b"C".to_vec())]
        );
        assert!(consumer.active_transfer().is_none());
    }

    fn assert_graphics_payload_is_plain_terminal_output(prefix: &[u8], suffix: &[u8]) {
        let mut consumer = ModemConsumer::new();
        let header = encode_hex_header(ZFrameType::ZrqInit, position_header(0), true);
        let mut first_chunk = prefix.to_vec();
        first_chunk.extend_from_slice(&header[..header.len() / 2]);
        let mut second_chunk = header[header.len() / 2..].to_vec();
        second_chunk.extend_from_slice(suffix);

        let first_events = consumer.process_server_output(&first_chunk);
        let second_events = consumer.process_server_output(&second_chunk);
        let mut terminal_output = terminal_bytes(&first_events);
        terminal_output.extend(terminal_bytes(&second_events));

        let mut expected = first_chunk;
        expected.extend(second_chunk);
        assert_eq!(terminal_output, expected);
        assert!(consumer.active_transfer().is_none());
    }

    #[test]
    fn xymodem_negotiation_uses_rx_echo_as_xmodem_hint() {
        let mut consumer = ModemConsumer::new();
        let events = consumer.process_server_output(b"\r\n$ rx upload.bin\r\nC");
        assert!(matches!(
            events.last(),
            Some(ModemConsumerEvent::TransferStarted(ModemTransferRequest {
                protocol: DetectedModemProtocol::Xmodem,
                direction: ModemTransferDirection::Upload
            }))
        ));
    }

    #[test]
    fn xymodem_negotiation_uses_rb_echo_as_ymodem_hint() {
        let mut consumer = ModemConsumer::new();
        let events = consumer.process_server_output(b"\r\n$ rb\r\nC");
        assert!(matches!(
            events.last(),
            Some(ModemConsumerEvent::TransferStarted(ModemTransferRequest {
                protocol: DetectedModemProtocol::Ymodem,
                direction: ModemTransferDirection::Upload
            }))
        ));
    }

    #[test]
    fn xymodem_like_serial_noise_is_plain_output_without_negotiation() {
        let mut consumer = ModemConsumer::new();
        let bytes = [
            b'e',
            crate::xymodem::SOH,
            1,
            0xfe,
            b'I',
            b' ',
            b'(',
            b'3',
            b'0',
            b')',
        ];
        let events = consumer.process_server_output(&bytes);
        assert_eq!(terminal_bytes(&events), bytes);
        assert!(
            !events
                .iter()
                .any(|event| matches!(event, ModemConsumerEvent::TransferStarted(_)))
        );
        assert!(consumer.active_transfer().is_none());
    }

    #[test]
    fn uppercase_c_in_plain_output_does_not_start_xymodem() {
        let mut consumer = ModemConsumer::new();
        let events = consumer.process_server_output(b"SECURITY.md\r\n");
        assert_eq!(terminal_bytes(&events), b"SECURITY.md\r\n");
        assert!(
            !events
                .iter()
                .any(|event| matches!(event, ModemConsumerEvent::TransferStarted(_)))
        );
        assert!(consumer.active_transfer().is_none());
    }

    #[test]
    fn uppercase_c_false_positive_does_not_swallow_later_output() {
        let mut consumer = ModemConsumer::new();
        assert_eq!(
            consumer.process_server_output(b"C"),
            vec![ModemConsumerEvent::WriteTerminal(b"C".to_vec())]
        );
        assert_eq!(
            consumer.process_server_output(b"ontinued\r\n"),
            vec![ModemConsumerEvent::WriteTerminal(b"ontinued\r\n".to_vec())]
        );
        assert!(consumer.active_transfer().is_none());
    }

    fn terminal_bytes(events: &[ModemConsumerEvent]) -> Vec<u8> {
        events
            .iter()
            .filter_map(|event| match event {
                ModemConsumerEvent::WriteTerminal(bytes) => Some(bytes.as_slice()),
                _ => None,
            })
            .flatten()
            .copied()
            .collect()
    }
}
