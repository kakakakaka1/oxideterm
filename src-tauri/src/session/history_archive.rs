// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Session-scoped ephemeral terminal history archive.
//!
//! This stores only lines evicted from the in-memory hot buffer. Archives live
//! for the lifetime of a backend session and are deleted when that session is
//! destroyed or during startup janitor cleanup after crashes.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use tracing::{debug, warn};

use super::scroll_buffer::TerminalLine;

const HISTORY_ARCHIVE_ROOT: &str = "terminal-history";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const CHUNK_LINE_LIMIT: usize = 1_000;
const CHUNK_BYTE_LIMIT: usize = 512 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum TerminalHistoryArchiveError {
    #[error("failed to resolve archive root: {0}")]
    Path(String),

    #[error("archive I/O failed: {0}")]
    Io(#[from] std::io::Error),

    #[error("archive serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("archive compression failed: {0}")]
    Compression(String),

    #[error("archive worker unavailable")]
    WorkerUnavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ArchivedLineRecord {
    line_number: u64,
    timestamp: u64,
    text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ansi_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchivedChunkMetadata {
    pub id: String,
    pub path: String,
    pub first_line: u64,
    pub last_line: u64,
    pub line_count: u64,
    pub compressed_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalHistoryManifest {
    pub version: u32,
    pub session_id: String,
    pub delete_on_close: bool,
    pub chunks: Vec<ArchivedChunkMetadata>,
}

enum ArchiveCommand {
    Append(Vec<TerminalLine>),
    Flush(mpsc::Sender<Result<(), String>>),
    Delete,
}

#[derive(Clone)]
pub struct TerminalHistoryArchive {
    session_dir: PathBuf,
    state: Arc<Mutex<ArchiveHandleState>>,
}

struct ArchiveHandleState {
    tx: mpsc::Sender<ArchiveCommand>,
    closing: bool,
}

impl TerminalHistoryArchive {
    pub fn new(session_id: &str) -> Result<Self, TerminalHistoryArchiveError> {
        let root = archive_root_dir()?;
        Self::new_in(root, session_id)
    }

    pub fn new_in(
        root_dir: PathBuf,
        session_id: &str,
    ) -> Result<Self, TerminalHistoryArchiveError> {
        let session_dir = root_dir.join(session_id);
        fs::create_dir_all(&session_dir)?;

        let (tx, rx) = mpsc::channel::<ArchiveCommand>();
        let state = ArchiveWriterState::new(session_dir.clone(), session_id.to_string())?;

        thread::Builder::new()
            .name(format!("terminal-history-{session_id}"))
            .spawn(move || archive_worker_loop(rx, state))
            .map_err(TerminalHistoryArchiveError::Io)?;

        Ok(Self {
            session_dir,
            state: Arc::new(Mutex::new(ArchiveHandleState { tx, closing: false })),
        })
    }

    pub fn append_lines(&self, lines: Vec<TerminalLine>) {
        if lines.is_empty() {
            return;
        }

        let mut state = self.lock_state();
        if state.closing {
            return;
        }

        if let Err(error) = state.tx.send(ArchiveCommand::Append(lines)) {
            state.closing = true;
            warn!("Terminal history archive append dropped: {}", error);
        }
    }

    pub fn flush(&self) -> Result<(), TerminalHistoryArchiveError> {
        let (tx, rx) = mpsc::channel();
        let state = self.lock_state();
        if state.closing {
            return Err(TerminalHistoryArchiveError::WorkerUnavailable);
        }

        state.tx
            .send(ArchiveCommand::Flush(tx))
            .map_err(|_| TerminalHistoryArchiveError::WorkerUnavailable)?;
        drop(state);

        match rx.recv() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(message)) => Err(TerminalHistoryArchiveError::Path(message)),
            Err(_) => Err(TerminalHistoryArchiveError::WorkerUnavailable),
        }
    }

    pub fn schedule_delete(&self) {
        let mut state = self.lock_state();
        if state.closing {
            return;
        }
        state.closing = true;

        if let Err(error) = state.tx.send(ArchiveCommand::Delete) {
            warn!("Terminal history archive delete dropped: {}", error);
        }
    }

    pub fn session_dir(&self) -> PathBuf {
        self.session_dir.clone()
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, ArchiveHandleState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

pub fn cleanup_stale_terminal_history_archives() -> Result<usize, TerminalHistoryArchiveError> {
    let root = archive_root_dir()?;
    cleanup_stale_archives_in(&root)
}

fn cleanup_stale_archives_in(root: &Path) -> Result<usize, TerminalHistoryArchiveError> {
    if !root.exists() {
        return Ok(0);
    }

    let mut removed = 0;
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)?;
            removed += 1;
        } else {
            fs::remove_file(&path)?;
        }
    }

    Ok(removed)
}

fn archive_root_dir() -> Result<PathBuf, TerminalHistoryArchiveError> {
    let base_dir = crate::config::storage::config_dir()
        .map_err(|error| TerminalHistoryArchiveError::Path(error.to_string()))?;
    Ok(base_dir.join(HISTORY_ARCHIVE_ROOT))
}

fn archive_worker_loop(rx: mpsc::Receiver<ArchiveCommand>, mut state: ArchiveWriterState) {
    while let Ok(command) = rx.recv() {
        match command {
            ArchiveCommand::Append(lines) => {
                if let Err(error) = state.append_lines(lines) {
                    warn!(
                        "Terminal history archive degraded for session {}: {}",
                        state.manifest.session_id, error
                    );
                    break;
                }
            }
            ArchiveCommand::Flush(response_tx) => {
                let result = state.flush().map_err(|error| error.to_string());
                let _ = response_tx.send(result);
            }
            ArchiveCommand::Delete => {
                let session_id = state.manifest.session_id.clone();
                if let Err(error) = state.delete_dir() {
                    warn!(
                        "Failed to delete terminal history archive for session {}: {}",
                        session_id, error
                    );
                }
                return;
            }
        }
    }

    debug!(
        "Terminal history archive worker stopped for session {}",
        state.manifest.session_id
    );
}

struct ArchiveWriterState {
    session_dir: PathBuf,
    manifest_path: PathBuf,
    manifest: TerminalHistoryManifest,
    next_chunk_number: u64,
    next_line_number: u64,
    active_chunk_first_line: Option<u64>,
    active_chunk_line_count: usize,
    active_chunk_bytes: usize,
    active_chunk_payload: Vec<u8>,
}

impl ArchiveWriterState {
    fn new(
        session_dir: PathBuf,
        session_id: String,
    ) -> Result<Self, TerminalHistoryArchiveError> {
        let manifest = TerminalHistoryManifest {
            version: 1,
            session_id,
            delete_on_close: true,
            chunks: Vec::new(),
        };
        let manifest_path = session_dir.join(MANIFEST_FILE_NAME);
        write_json_atomic(&manifest_path, &manifest)?;

        Ok(Self {
            session_dir,
            manifest_path,
            manifest,
            next_chunk_number: 1,
            next_line_number: 0,
            active_chunk_first_line: None,
            active_chunk_line_count: 0,
            active_chunk_bytes: 0,
            active_chunk_payload: Vec::new(),
        })
    }

    fn append_lines(&mut self, lines: Vec<TerminalLine>) -> Result<(), TerminalHistoryArchiveError> {
        for line in lines {
            self.append_line(line)?;
        }
        Ok(())
    }

    fn append_line(&mut self, line: TerminalLine) -> Result<(), TerminalHistoryArchiveError> {
        let line_number = self.next_line_number;
        self.next_line_number += 1;

        if self.active_chunk_first_line.is_none() {
            self.active_chunk_first_line = Some(line_number);
        }

        let record = ArchivedLineRecord {
            line_number,
            timestamp: line.timestamp,
            text: line.text,
            ansi_text: line.ansi_text,
        };

        let mut encoded = serde_json::to_vec(&record)?;
        encoded.push(b'\n');

        self.active_chunk_bytes += encoded.len();
        self.active_chunk_line_count += 1;
        self.active_chunk_payload.extend_from_slice(&encoded);

        if self.active_chunk_line_count >= CHUNK_LINE_LIMIT
            || self.active_chunk_bytes >= CHUNK_BYTE_LIMIT
        {
            self.flush()?;
        }

        Ok(())
    }

    fn flush(&mut self) -> Result<(), TerminalHistoryArchiveError> {
        if self.active_chunk_line_count == 0 {
            return Ok(());
        }

        let first_line = self
            .active_chunk_first_line
            .expect("active chunk line count implies first line");
        let last_line = self.next_line_number.saturating_sub(1);
        let chunk_id = format!("{:06}", self.next_chunk_number);
        let chunk_name = format!("{chunk_id}.ndjson.zst");
        let chunk_path = self.session_dir.join(&chunk_name);

        let compressed = zstd::stream::encode_all(Cursor::new(&self.active_chunk_payload), 3)
            .map_err(|error| TerminalHistoryArchiveError::Compression(error.to_string()))?;
        write_bytes_atomic(&chunk_path, &compressed)?;

        self.manifest.chunks.push(ArchivedChunkMetadata {
            id: chunk_id,
            path: chunk_name,
            first_line,
            last_line,
            line_count: self.active_chunk_line_count as u64,
            compressed_bytes: compressed.len() as u64,
        });
        write_json_atomic(&self.manifest_path, &self.manifest)?;

        self.next_chunk_number += 1;
        self.active_chunk_first_line = None;
        self.active_chunk_line_count = 0;
        self.active_chunk_bytes = 0;
        self.active_chunk_payload.clear();

        Ok(())
    }

    fn delete_dir(&mut self) -> Result<(), TerminalHistoryArchiveError> {
        self.active_chunk_payload.clear();
        self.active_chunk_line_count = 0;
        self.active_chunk_bytes = 0;

        if self.session_dir.exists() {
            fs::remove_dir_all(&self.session_dir)?;
        }

        Ok(())
    }
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), TerminalHistoryArchiveError> {
    let payload = serde_json::to_vec_pretty(value)?;
    write_bytes_atomic(path, &payload)
}

fn write_bytes_atomic(path: &Path, payload: &[u8]) -> Result<(), TerminalHistoryArchiveError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let temp_path = path.with_file_name(format!(
        "{}.tmp",
        path.file_name().and_then(|name| name.to_str()).unwrap_or("archive")
    ));
    fs::write(&temp_path, payload)?;
    fs::rename(&temp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_archive_flush_writes_manifest_and_chunk() {
        let temp_dir = TempDir::new().unwrap();
        let archive = TerminalHistoryArchive::new_in(temp_dir.path().to_path_buf(), "session-1").unwrap();

        archive.append_lines(vec![
            TerminalLine::with_ansi_timestamp("hello".to_string(), None, 1),
            TerminalLine::with_ansi_timestamp(
                "world".to_string(),
                Some("\x1b[31mworld\x1b[0m".to_string()),
                2,
            ),
        ]);
        archive.flush().unwrap();

        let session_dir = archive.session_dir();
        let manifest_path = session_dir.join(MANIFEST_FILE_NAME);
        let manifest_json = fs::read_to_string(manifest_path).unwrap();
        let manifest: TerminalHistoryManifest = serde_json::from_str(&manifest_json).unwrap();

        assert_eq!(manifest.session_id, "session-1");
        assert_eq!(manifest.chunks.len(), 1);

        let chunk_path = session_dir.join(&manifest.chunks[0].path);
        assert!(chunk_path.exists());

        let compressed = fs::read(chunk_path).unwrap();
        let decoded = zstd::stream::decode_all(Cursor::new(compressed)).unwrap();
        let content = String::from_utf8(decoded).unwrap();
        assert!(content.contains("\"text\":\"hello\""));
        assert!(content.contains("\"text\":\"world\""));
    }

    #[test]
    fn test_archive_delete_removes_session_directory() {
        let temp_dir = TempDir::new().unwrap();
        let archive = TerminalHistoryArchive::new_in(temp_dir.path().to_path_buf(), "session-2").unwrap();

        let session_dir = archive.session_dir();
        assert!(session_dir.exists());

        archive.schedule_delete();
        std::thread::sleep(std::time::Duration::from_millis(50));

        assert!(!session_dir.exists());
    }

    #[test]
    fn test_cleanup_stale_archives_removes_children() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path().join(HISTORY_ARCHIVE_ROOT);
        fs::create_dir_all(root.join("a")).unwrap();
        fs::create_dir_all(root.join("b")).unwrap();

        let removed = cleanup_stale_archives_in(&root).unwrap();

        assert_eq!(removed, 2);
        assert!(!root.join("a").exists());
        assert!(!root.join("b").exists());
    }
}