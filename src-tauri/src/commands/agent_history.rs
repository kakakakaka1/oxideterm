// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Agent Task History Commands (v2)
//!
//! Tauri IPC commands for persisting and querying agent task history.
//! v2 separates metadata from steps for lazy loading and incremental persistence.

use crate::state::agent_history::TaskMeta;
use crate::state::AgentHistoryStore;
use std::sync::Arc;
use tauri::State;

/// Save task metadata (without steps). Creates or updates the index entry.
#[tauri::command]
pub async fn agent_history_save_meta(
    meta_json: String,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    let meta: TaskMeta =
        serde_json::from_str(&meta_json).map_err(|e| format!("Invalid meta JSON: {}", e))?;
    store
        .save_meta(&meta)
        .map_err(|e| format!("Failed to save task meta: {}", e))
}

/// Update existing task metadata (e.g. status change, step_count bump).
#[tauri::command]
pub async fn agent_history_update_meta(
    meta_json: String,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    let meta: TaskMeta =
        serde_json::from_str(&meta_json).map_err(|e| format!("Invalid meta JSON: {}", e))?;
    store
        .update_meta(&meta)
        .map_err(|e| format!("Failed to update task meta: {}", e))
}

/// List task metadata (newest first) with optional filters.
#[tauri::command]
pub async fn agent_history_list_meta(
    limit: u32,
    status_filter: Option<String>,
    search_query: Option<String>,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<Vec<String>, String> {
    let metas = store
        .list_meta(
            limit as usize,
            status_filter.as_deref(),
            search_query.as_deref(),
        )
        .map_err(|e| format!("Failed to list task meta: {}", e))?;

    // Serialize each TaskMeta back to JSON for the frontend
    metas
        .iter()
        .map(|m| serde_json::to_string(m).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

/// Append a single step to a task.
#[tauri::command]
pub async fn agent_history_append_step(
    task_id: String,
    step_index: u32,
    step_json: String,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    store
        .append_step(&task_id, step_index, &step_json)
        .map_err(|e| format!("Failed to append step: {}", e))
}

/// Save multiple steps at once (bulk save after task completion).
#[tauri::command]
pub async fn agent_history_save_steps(
    task_id: String,
    steps_json: Vec<String>,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    store
        .save_steps(&task_id, &steps_json)
        .map_err(|e| format!("Failed to save steps: {}", e))
}

/// Get steps for a task with pagination.
#[tauri::command]
pub async fn agent_history_get_steps(
    task_id: String,
    offset: u32,
    limit: u32,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<Vec<String>, String> {
    store
        .get_steps(&task_id, offset, limit)
        .map_err(|e| format!("Failed to get steps: {}", e))
}

/// Save a checkpoint of the running task (crash recovery).
#[tauri::command]
pub async fn agent_history_save_checkpoint(
    task_json: String,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    store
        .save_checkpoint(&task_json)
        .map_err(|e| format!("Failed to save checkpoint: {}", e))
}

/// Load checkpoint (if any).
#[tauri::command]
pub async fn agent_history_load_checkpoint(
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<Option<String>, String> {
    store
        .load_checkpoint()
        .map_err(|e| format!("Failed to load checkpoint: {}", e))
}

/// Clear the checkpoint.
#[tauri::command]
pub async fn agent_history_clear_checkpoint(
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    store
        .clear_checkpoint()
        .map_err(|e| format!("Failed to clear checkpoint: {}", e))
}

/// Delete a single agent task by ID (metadata + all steps).
#[tauri::command]
pub async fn agent_history_delete(
    task_id: String,
    store: State<'_, Arc<AgentHistoryStore>>,
) -> Result<(), String> {
    store
        .delete_task(&task_id)
        .map_err(|e| format!("Failed to delete agent task: {}", e))
}

/// Clear all agent task history.
#[tauri::command]
pub async fn agent_history_clear(store: State<'_, Arc<AgentHistoryStore>>) -> Result<(), String> {
    store
        .clear()
        .map_err(|e| format!("Failed to clear agent history: {}", e))
}
