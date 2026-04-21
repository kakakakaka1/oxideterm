// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use std::sync::Arc;

use tauri::State;

use crate::trzsz::download;
use crate::trzsz::error::TrzszError;
use crate::trzsz::path_guard::validate_owner_id;
use crate::trzsz::upload;
use crate::trzsz::{
    TrzszCapabilitiesDto, TrzszDownloadOpenDto, TrzszOwnerCleanupDto,
    TrzszPreparedDownloadRootDto, TrzszState, TrzszUploadEntryDto, TrzszUploadHandleDto,
};

#[tauri::command]
pub async fn trzsz_get_capabilities() -> Result<TrzszCapabilitiesDto, TrzszError> {
    Ok(TrzszCapabilitiesDto::default())
}

#[tauri::command]
pub async fn trzsz_build_upload_entries(
    owner_id: String,
    api_version: u32,
    paths: Vec<String>,
    allow_directory: bool,
    state: State<'_, Arc<TrzszState>>,
) -> Result<Vec<TrzszUploadEntryDto>, TrzszError> {
    upload::build_upload_entries(state.inner().as_ref(), &owner_id, api_version, paths, allow_directory)
}

#[tauri::command]
pub async fn trzsz_open_upload_file(
    owner_id: String,
    api_version: u32,
    path: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<TrzszUploadHandleDto, TrzszError> {
    upload::open_upload_file(state.inner().as_ref(), &owner_id, api_version, path)
}

#[tauri::command]
pub async fn trzsz_read_upload_chunk(
    owner_id: String,
    api_version: u32,
    handle_id: String,
    offset: u64,
    length: usize,
    state: State<'_, Arc<TrzszState>>,
) -> Result<Vec<u8>, TrzszError> {
    upload::read_upload_chunk(
        state.inner().as_ref(),
        &owner_id,
        api_version,
        &handle_id,
        offset,
        length,
    )
}

#[tauri::command]
pub async fn trzsz_close_upload_file(
    owner_id: String,
    api_version: u32,
    handle_id: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<(), TrzszError> {
    upload::close_upload_file(state.inner().as_ref(), &owner_id, api_version, &handle_id)
}

#[tauri::command]
pub async fn trzsz_prepare_download_root(
    owner_id: String,
    api_version: u32,
    root_path: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<TrzszPreparedDownloadRootDto, TrzszError> {
    download::prepare_download_root(state.inner().as_ref(), &owner_id, api_version, root_path)
}

#[tauri::command]
pub async fn trzsz_open_save_file(
    owner_id: String,
    api_version: u32,
    root_path: String,
    file_name: String,
    directory: bool,
    overwrite: bool,
    state: State<'_, Arc<TrzszState>>,
) -> Result<TrzszDownloadOpenDto, TrzszError> {
    download::open_save_file(
        state.inner().as_ref(),
        &owner_id,
        api_version,
        root_path,
        file_name,
        directory,
        overwrite,
    )
}

#[tauri::command]
pub async fn trzsz_write_download_chunk(
    owner_id: String,
    api_version: u32,
    writer_id: String,
    data: Vec<u8>,
    state: State<'_, Arc<TrzszState>>,
) -> Result<(), TrzszError> {
    download::write_download_chunk(
        state.inner().as_ref(),
        &owner_id,
        api_version,
        &writer_id,
        data,
    )
}

#[tauri::command]
pub async fn trzsz_finish_download_file(
    owner_id: String,
    api_version: u32,
    writer_id: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<(), TrzszError> {
    download::finish_download_file(state.inner().as_ref(), &owner_id, api_version, &writer_id)
}

#[tauri::command]
pub async fn trzsz_abort_download_file(
    owner_id: String,
    api_version: u32,
    writer_id: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<(), TrzszError> {
    download::abort_download_file(state.inner().as_ref(), &owner_id, api_version, &writer_id)
}

#[tauri::command]
pub async fn trzsz_cleanup_owner(
    owner_id: String,
    state: State<'_, Arc<TrzszState>>,
) -> Result<TrzszOwnerCleanupDto, TrzszError> {
    validate_owner_id(&owner_id)?;
    Ok(state.inner().cleanup_owner(&owner_id))
}