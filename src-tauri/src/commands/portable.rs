// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Portable mode inspection commands.

use serde::Serialize;

use super::config::ConfigState;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableInfoResponse {
    pub is_portable: bool,
    pub exe_dir: String,
    pub marker_path: String,
    pub data_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableStatusResponse {
    pub is_portable: bool,
    pub status: crate::config::PortableBootstrapStatus,
    pub can_launch_app: bool,
    pub has_keystore: bool,
    pub is_unlocked: bool,
    pub keystore_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableMigrationSummaryResponse {
    pub is_portable: bool,
    pub current_data_dir: String,
    pub portable_data_dir: String,
    pub exportable_portable_secret_count: usize,
}

fn build_status_response() -> Result<PortableStatusResponse, String> {
    let info = crate::config::portable_info().map_err(|e| e.to_string())?;
    let status = crate::config::portable_bootstrap_status().map_err(|e| e.to_string())?;
    let keystore_path = crate::config::portable_keystore::portable_keystore_file_path()
        .map_err(|e| e.to_string())?
        .map(|path| path.to_string_lossy().to_string());

    Ok(PortableStatusResponse {
        is_portable: info.is_portable,
        status,
        can_launch_app: status.can_launch_full_app(),
        has_keystore: status.has_keystore(),
        is_unlocked: crate::config::portable_keystore::is_portable_keystore_unlocked(),
        keystore_path,
    })
}

#[tauri::command]
pub async fn get_portable_info() -> Result<PortableInfoResponse, String> {
    let info = crate::config::portable_info().map_err(|e| e.to_string())?;

    Ok(PortableInfoResponse {
        is_portable: info.is_portable,
        exe_dir: info.exe_dir.to_string_lossy().to_string(),
        marker_path: info.marker_path.to_string_lossy().to_string(),
        data_dir: info.data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn get_portable_status() -> Result<PortableStatusResponse, String> {
    build_status_response()
}

#[tauri::command]
pub async fn get_portable_migration_summary(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
) -> Result<PortableMigrationSummaryResponse, String> {
    let portable_info = crate::config::portable_info().map_err(|e| e.to_string())?;
    let data_dir_info = crate::config::storage::get_data_dir_info().map_err(|e| e.to_string())?;

    Ok(PortableMigrationSummaryResponse {
        is_portable: portable_info.is_portable,
        current_data_dir: data_dir_info.effective.to_string_lossy().to_string(),
        portable_data_dir: portable_info.data_dir.to_string_lossy().to_string(),
        exportable_portable_secret_count: state.count_exportable_ai_provider_keys(&app_handle)?,
    })
}

#[tauri::command]
pub async fn setup_portable_keystore(
    state: State<'_, Arc<ConfigState>>,
    password: String,
) -> Result<PortableStatusResponse, String> {
    state.setup_portable_keystore(&password).await?;
    build_status_response()
}

#[tauri::command]
pub async fn unlock_portable_keystore(
    state: State<'_, Arc<ConfigState>>,
    password: String,
) -> Result<PortableStatusResponse, String> {
    state.unlock_portable_keystore(&password).await?;
    build_status_response()
}

#[tauri::command]
pub async fn reset_portable_keystore(
    state: State<'_, Arc<ConfigState>>,
) -> Result<PortableStatusResponse, String> {
    state.reset_portable_keystore().await?;
    build_status_response()
}
