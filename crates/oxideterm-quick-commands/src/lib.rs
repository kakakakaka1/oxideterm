// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Quick Commands snapshot storage and import semantics.
//!
//! The GPUI view owns interaction state; this crate owns the portable snapshot
//! format used by `.oxide` import/export and the CLI.

pub mod model;
pub mod store;

pub use model::{
    QUICK_COMMANDS_SCHEMA_VERSION, QuickCommand, QuickCommandCategory, QuickCommandIcon,
    QuickCommandImportResult, QuickCommandImportStrategy, QuickCommandsSnapshot,
};
pub use store::{
    MAX_CATEGORIES, QuickCommandsCheckpoint, apply_snapshot_json, capture_checkpoint,
    default_quick_command_categories, default_quick_commands, export_snapshot_json,
    is_builtin_category_id, load_snapshot, new_quick_category_id, new_quick_command_id, now_ms,
    quick_commands_path, restore_checkpoint, save_snapshot,
};
