// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Shared path utilities

use std::path::{Path, PathBuf};

/// Expand `~` or `~/...` to the user's home directory.
///
/// Returns the original path unchanged if `~` prefix is not present
/// or if the home directory cannot be determined.
pub fn expand_tilde(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped).to_string_lossy().into_owned();
        }
    } else if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home.to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

/// Expand `~` or `~/...` to the user's home directory (Path variant).
///
/// Returns the original path unchanged if `~` prefix is not present
/// or if the home directory cannot be determined.
pub fn expand_tilde_path(path: &Path) -> PathBuf {
    let path_str = path.to_string_lossy();

    if let Some(stripped) = path_str.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    } else if path_str == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }

    path.to_path_buf()
}
