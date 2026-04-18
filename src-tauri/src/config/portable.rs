// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Portable mode detection and path helpers.

use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, OnceLock};
use tauri::Manager;

const PORTABLE_MARKER_FILENAME: &str = "portable";
const PORTABLE_DATA_DIRNAME: &str = "data";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PortableBootstrapStatus {
    Disabled,
    NeedsSetup,
    Locked,
    Unlocked,
}

impl PortableBootstrapStatus {
    pub fn can_launch_full_app(self) -> bool {
        matches!(self, Self::Disabled | Self::Unlocked)
    }

    pub fn has_keystore(self) -> bool {
        matches!(self, Self::Locked | Self::Unlocked)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortableInfo {
    pub is_portable: bool,
    pub exe_dir: PathBuf,
    pub marker_path: PathBuf,
    pub data_dir: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum PortableError {
    #[error("Failed to determine current executable path: {0}")]
    CurrentExe(#[source] std::io::Error),

    #[error("Executable path has no parent directory: {0}")]
    MissingExeParent(PathBuf),

    #[error("Failed to get app data dir: {0}")]
    AppDataDir(String),

    #[error("Portable keystore error: {0}")]
    Keystore(String),
}

static PORTABLE_INFO: OnceLock<PortableInfo> = OnceLock::new();
static PORTABLE_BOOTSTRAP_STATUS: LazyLock<RwLock<Option<PortableBootstrapStatus>>> =
    LazyLock::new(|| RwLock::new(None));

pub fn detect_portable_info_from_exe(exe_path: &Path) -> Result<PortableInfo, PortableError> {
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| PortableError::MissingExeParent(exe_path.to_path_buf()))?
        .to_path_buf();
    let marker_path = exe_dir.join(PORTABLE_MARKER_FILENAME);
    let data_dir = exe_dir.join(PORTABLE_DATA_DIRNAME);
    #[cfg(target_os = "windows")]
    let is_portable = marker_path.exists();
    #[cfg(not(target_os = "windows"))]
    let is_portable = false;

    Ok(PortableInfo {
        is_portable,
        exe_dir,
        marker_path,
        data_dir,
    })
}

pub fn portable_info() -> Result<&'static PortableInfo, PortableError> {
    if let Some(info) = PORTABLE_INFO.get() {
        return Ok(info);
    }

    let exe_path = std::env::current_exe().map_err(PortableError::CurrentExe)?;
    let detected = detect_portable_info_from_exe(&exe_path)?;
    Ok(PORTABLE_INFO.get_or_init(|| detected))
}

pub fn is_portable_mode() -> Result<bool, PortableError> {
    Ok(portable_info()?.is_portable)
}

pub fn portable_data_dir() -> Result<Option<PathBuf>, PortableError> {
    let info = portable_info()?;
    Ok(info.is_portable.then(|| info.data_dir.clone()))
}

fn detect_portable_bootstrap_status() -> Result<PortableBootstrapStatus, PortableError> {
    let info = portable_info()?;
    if !info.is_portable {
        return Ok(PortableBootstrapStatus::Disabled);
    }

    let has_keystore = crate::config::portable_keystore::portable_keystore_exists()
        .map_err(|e| PortableError::Keystore(e.to_string()))?;

    Ok(if has_keystore {
        PortableBootstrapStatus::Locked
    } else {
        PortableBootstrapStatus::NeedsSetup
    })
}

pub fn initialize_portable_runtime() -> Result<PortableBootstrapStatus, PortableError> {
    let status = detect_portable_bootstrap_status()?;
    *PORTABLE_BOOTSTRAP_STATUS.write() = Some(status);
    Ok(status)
}

pub fn portable_bootstrap_status() -> Result<PortableBootstrapStatus, PortableError> {
    if let Some(status) = *PORTABLE_BOOTSTRAP_STATUS.read() {
        return Ok(status);
    }
    initialize_portable_runtime()
}

pub fn set_portable_bootstrap_status(status: PortableBootstrapStatus) -> Result<(), PortableError> {
    *PORTABLE_BOOTSTRAP_STATUS.write() = Some(status);
    Ok(())
}

pub fn portable_can_launch_full_app() -> Result<bool, PortableError> {
    Ok(portable_bootstrap_status()?.can_launch_full_app())
}

pub fn portable_aware_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, PortableError> {
    if let Some(data_dir) = portable_data_dir()? {
        return Ok(data_dir);
    }

    app.path()
        .app_data_dir()
        .map_err(|e: tauri::Error| PortableError::AppDataDir(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn marker_only_enables_portable_mode_on_windows() {
        let temp = tempdir().unwrap();
        let exe_path = temp.path().join("OxideTerm.exe");
        std::fs::write(&exe_path, b"").unwrap();
        std::fs::write(temp.path().join(PORTABLE_MARKER_FILENAME), b"").unwrap();

        let info = detect_portable_info_from_exe(&exe_path).unwrap();

        #[cfg(target_os = "windows")]
        assert!(info.is_portable);
        #[cfg(not(target_os = "windows"))]
        assert!(!info.is_portable);
        assert_eq!(info.exe_dir, temp.path());
        assert_eq!(info.marker_path, temp.path().join(PORTABLE_MARKER_FILENAME));
        assert_eq!(info.data_dir, temp.path().join(PORTABLE_DATA_DIRNAME));
    }

    #[test]
    fn missing_marker_stays_in_normal_mode() {
        let temp = tempdir().unwrap();
        let exe_path = temp.path().join("OxideTerm.exe");
        std::fs::write(&exe_path, b"").unwrap();

        let info = detect_portable_info_from_exe(&exe_path).unwrap();

        assert!(!info.is_portable);
        assert_eq!(info.marker_path, temp.path().join(PORTABLE_MARKER_FILENAME));
        assert_eq!(info.data_dir, temp.path().join(PORTABLE_DATA_DIRNAME));
    }

    #[test]
    fn portable_bootstrap_status_helpers_match_expectations() {
        assert!(PortableBootstrapStatus::Disabled.can_launch_full_app());
        assert!(!PortableBootstrapStatus::NeedsSetup.can_launch_full_app());
        assert!(!PortableBootstrapStatus::Locked.can_launch_full_app());
        assert!(PortableBootstrapStatus::Unlocked.can_launch_full_app());
        assert!(!PortableBootstrapStatus::NeedsSetup.has_keystore());
        assert!(PortableBootstrapStatus::Locked.has_keystore());
    }
}
