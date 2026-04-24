// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Minimal Telnet transport for terminal sessions.
//!
//! Telnet is intentionally kept as a transport adapter: terminal rendering,
//! tab lifecycle, buffering, and frontend events remain shared with local
//! terminal sessions.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot};

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;

const OPT_BINARY: u8 = 0;
const OPT_ECHO: u8 = 1;
const OPT_SUPPRESS_GO_AHEAD: u8 = 3;
const OPT_TERMINAL_TYPE: u8 = 24;
const OPT_NAWS: u8 = 31;

const TTYPE_IS: u8 = 0;
const TTYPE_SEND: u8 = 1;

#[derive(Debug, thiserror::Error)]
pub enum TelnetError {
    #[error("Failed to connect to {host}:{port}: {source}")]
    Connect {
        host: String,
        port: u16,
        source: std::io::Error,
    },

    #[error("Timed out connecting to {host}:{port}")]
    ConnectTimeout { host: String, port: u16 },
}

#[derive(Debug)]
pub struct TelnetSessionHandle {
    pub input_tx: mpsc::Sender<Vec<u8>>,
    pub resize_tx: mpsc::Sender<(u16, u16)>,
    pub task: tokio::task::JoinHandle<()>,
    pub close_tx: oneshot::Sender<()>,
}

#[derive(Debug)]
enum TelnetParseState {
    Data,
    Iac,
    Command(u8),
    Subnegotiation {
        option: Option<u8>,
        data: Vec<u8>,
        saw_iac: bool,
    },
}

#[derive(Debug)]
pub struct TelnetCodec {
    state: TelnetParseState,
    naws_enabled: bool,
    terminal_type_enabled: bool,
}

impl Default for TelnetCodec {
    fn default() -> Self {
        Self::new()
    }
}

impl TelnetCodec {
    pub fn new() -> Self {
        Self {
            state: TelnetParseState::Data,
            naws_enabled: false,
            terminal_type_enabled: false,
        }
    }

    pub fn encode_naws(cols: u16, rows: u16) -> [u8; 9] {
        [
            IAC,
            SB,
            OPT_NAWS,
            (cols >> 8) as u8,
            cols as u8,
            (rows >> 8) as u8,
            rows as u8,
            IAC,
            SE,
        ]
    }

    pub fn process_incoming(&mut self, input: &[u8]) -> (Vec<u8>, Vec<Vec<u8>>) {
        let mut output = Vec::with_capacity(input.len());
        let mut replies = Vec::new();

        for &byte in input {
            let current_state = std::mem::replace(&mut self.state, TelnetParseState::Data);
            self.state = match current_state {
                TelnetParseState::Data => {
                    if byte == IAC {
                        TelnetParseState::Iac
                    } else {
                        output.push(byte);
                        TelnetParseState::Data
                    }
                }
                TelnetParseState::Iac => match byte {
                    IAC => {
                        output.push(IAC);
                        TelnetParseState::Data
                    }
                    DO | DONT | WILL | WONT => TelnetParseState::Command(byte),
                    SB => TelnetParseState::Subnegotiation {
                        option: None,
                        data: Vec::new(),
                        saw_iac: false,
                    },
                    _ => TelnetParseState::Data,
                },
                TelnetParseState::Command(command) => {
                    if let Some(reply) = self.negotiate(command, byte) {
                        replies.push(reply);
                    }
                    TelnetParseState::Data
                }
                TelnetParseState::Subnegotiation {
                    mut option,
                    mut data,
                    mut saw_iac,
                } => {
                    if option.is_none() {
                        option = Some(byte);
                        TelnetParseState::Subnegotiation {
                            option,
                            data,
                            saw_iac,
                        }
                    } else if saw_iac {
                        if byte == SE {
                            if let Some(reply) =
                                self.handle_subnegotiation(option.unwrap_or_default(), &data)
                            {
                                replies.push(reply);
                            }
                            TelnetParseState::Data
                        } else if byte == IAC {
                            data.push(IAC);
                            saw_iac = false;
                            TelnetParseState::Subnegotiation {
                                option,
                                data,
                                saw_iac,
                            }
                        } else {
                            saw_iac = false;
                            TelnetParseState::Subnegotiation {
                                option,
                                data,
                                saw_iac,
                            }
                        }
                    } else if byte == IAC {
                        saw_iac = true;
                        TelnetParseState::Subnegotiation {
                            option,
                            data,
                            saw_iac,
                        }
                    } else {
                        data.push(byte);
                        TelnetParseState::Subnegotiation {
                            option,
                            data,
                            saw_iac,
                        }
                    }
                }
            };
        }

        (output, replies)
    }

    pub fn naws_enabled(&self) -> bool {
        self.naws_enabled
    }

    fn negotiate(&mut self, command: u8, option: u8) -> Option<Vec<u8>> {
        match command {
            DO => match option {
                OPT_NAWS => {
                    self.naws_enabled = true;
                    Some(vec![IAC, WILL, option])
                }
                OPT_TERMINAL_TYPE => {
                    self.terminal_type_enabled = true;
                    Some(vec![IAC, WILL, option])
                }
                OPT_SUPPRESS_GO_AHEAD | OPT_BINARY => Some(vec![IAC, WILL, option]),
                _ => Some(vec![IAC, WONT, option]),
            },
            WILL => match option {
                OPT_ECHO | OPT_SUPPRESS_GO_AHEAD | OPT_BINARY => Some(vec![IAC, DO, option]),
                _ => Some(vec![IAC, DONT, option]),
            },
            DONT => {
                if option == OPT_NAWS {
                    self.naws_enabled = false;
                }
                if option == OPT_TERMINAL_TYPE {
                    self.terminal_type_enabled = false;
                }
                None
            }
            WONT => None,
            _ => None,
        }
    }

    fn handle_subnegotiation(&self, option: u8, data: &[u8]) -> Option<Vec<u8>> {
        if option == OPT_TERMINAL_TYPE
            && self.terminal_type_enabled
            && data.first() == Some(&TTYPE_SEND)
        {
            let mut response = vec![IAC, SB, OPT_TERMINAL_TYPE, TTYPE_IS];
            response.extend_from_slice(b"xterm-256color");
            response.extend_from_slice(&[IAC, SE]);
            return Some(response);
        }
        None
    }
}

pub async fn start_telnet_session(
    host: String,
    port: u16,
    cols: u16,
    rows: u16,
    output_tx: mpsc::Sender<Vec<u8>>,
    closed_tx: mpsc::Sender<()>,
) -> Result<TelnetSessionHandle, TelnetError> {
    let address = format!("{}:{}", host, port);
    let stream =
        match tokio::time::timeout(Duration::from_secs(10), TcpStream::connect(&address)).await {
            Ok(Ok(stream)) => stream,
            Ok(Err(source)) => return Err(TelnetError::Connect { host, port, source }),
            Err(_) => return Err(TelnetError::ConnectTimeout { host, port }),
        };
    let _ = stream.set_nodelay(true);

    let (mut reader, mut writer) = stream.into_split();
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(32);
    let (close_tx, mut close_rx) = oneshot::channel::<()>();

    let task = tokio::spawn(async move {
        let mut codec = TelnetCodec::new();
        let mut read_buf = vec![0u8; 8192];
        let mut pending_naws = Some((cols, rows));

        loop {
            tokio::select! {
                biased;

                _ = &mut close_rx => {
                    let _ = writer.shutdown().await;
                    break;
                }
                Some(data) = input_rx.recv() => {
                    if writer.write_all(&data).await.is_err() {
                        break;
                    }
                    let _ = writer.flush().await;
                }
                Some((next_cols, next_rows)) = resize_rx.recv() => {
                    if codec.naws_enabled() {
                        if writer.write_all(&TelnetCodec::encode_naws(next_cols, next_rows)).await.is_err() {
                            break;
                        }
                        let _ = writer.flush().await;
                    } else {
                        pending_naws = Some((next_cols, next_rows));
                    }
                }
                read_result = reader.read(&mut read_buf) => {
                    let read_len = match read_result {
                        Ok(0) => break,
                        Ok(read_len) => read_len,
                        Err(err) => {
                            tracing::warn!("Telnet read failed: {}", err);
                            break;
                        }
                    };

                    let (data, replies) = codec.process_incoming(&read_buf[..read_len]);
                    for reply in replies {
                        if writer.write_all(&reply).await.is_err() {
                            break;
                        }
                    }
                    if codec.naws_enabled() {
                        if let Some((next_cols, next_rows)) = pending_naws.take() {
                            let _ = writer.write_all(&TelnetCodec::encode_naws(next_cols, next_rows)).await;
                        }
                    }
                    let _ = writer.flush().await;

                    if !data.is_empty() && output_tx.send(data).await.is_err() {
                        break;
                    }
                }
            }
        }

        let _ = closed_tx.send(()).await;
    });

    Ok(TelnetSessionHandle {
        input_tx,
        resize_tx,
        task,
        close_tx,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telnet_codec_filters_negotiation_and_keeps_data() {
        let mut codec = TelnetCodec::new();
        let (data, replies) = codec.process_incoming(&[b'h', b'i', IAC, DO, OPT_NAWS, b'!']);

        assert_eq!(data, b"hi!");
        assert_eq!(replies, vec![vec![IAC, WILL, OPT_NAWS]]);
        assert!(codec.naws_enabled());
    }

    #[test]
    fn telnet_codec_unescapes_literal_iac() {
        let mut codec = TelnetCodec::new();
        let (data, replies) = codec.process_incoming(&[b'a', IAC, IAC, b'b']);

        assert_eq!(data, vec![b'a', IAC, b'b']);
        assert!(replies.is_empty());
    }

    #[test]
    fn telnet_codec_replies_to_terminal_type_send() {
        let mut codec = TelnetCodec::new();
        let (_, negotiation) = codec.process_incoming(&[IAC, DO, OPT_TERMINAL_TYPE]);
        let (data, replies) =
            codec.process_incoming(&[IAC, SB, OPT_TERMINAL_TYPE, TTYPE_SEND, IAC, SE]);

        assert!(data.is_empty());
        assert_eq!(negotiation, vec![vec![IAC, WILL, OPT_TERMINAL_TYPE]]);
        assert_eq!(
            replies,
            vec![{
                let mut expected = vec![IAC, SB, OPT_TERMINAL_TYPE, TTYPE_IS];
                expected.extend_from_slice(b"xterm-256color");
                expected.extend_from_slice(&[IAC, SE]);
                expected
            }]
        );
    }
}
