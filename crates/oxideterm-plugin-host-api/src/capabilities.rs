// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Shared plugin capability names used by host API gates.

pub const NATIVE_PLUGIN_CAPABILITY_FILESYSTEM_READ: &str = "filesystem.read";
pub const NATIVE_PLUGIN_CAPABILITY_FILESYSTEM_WRITE: &str = "filesystem.write";
pub const NATIVE_PLUGIN_CAPABILITY_FILESYSTEM_DELETE: &str = "filesystem.delete";
pub const NATIVE_PLUGIN_CAPABILITY_NETWORK_FORWARD: &str = "network.forward";
pub const NATIVE_PLUGIN_CAPABILITY_NETWORK_FORWARD_READ: &str = "network.forward.read";
pub const NATIVE_PLUGIN_CAPABILITY_APP_SETTINGS_READ: &str = "app.settings.read";
pub const NATIVE_PLUGIN_CAPABILITY_APP_SYNC_REFRESH: &str = "app.sync.refresh";
pub const NATIVE_PLUGIN_CAPABILITY_CONNECTIONS_READ: &str = "connections.read";
pub const NATIVE_PLUGIN_CAPABILITY_SESSIONS_READ: &str = "sessions.read";
pub const NATIVE_PLUGIN_CAPABILITY_TERMINAL_CONTENT_READ: &str = "terminal.content.read";
pub const NATIVE_PLUGIN_CAPABILITY_TERMINAL_WRITE: &str = "terminal.write";
pub const NATIVE_PLUGIN_CAPABILITY_CREDENTIALS_MANAGE: &str = "credentials.manage";
pub const NATIVE_PLUGIN_CAPABILITY_CREDENTIALS_RAW_READ: &str = "credentials.raw.read";
pub const NATIVE_PLUGIN_CAPABILITY_NETWORK_HTTP: &str = "network.http";
pub const NATIVE_PLUGIN_CAPABILITY_SYNC_READ: &str = "sync.read";
pub const NATIVE_PLUGIN_CAPABILITY_SYNC_WRITE: &str = "sync.write";
pub const NATIVE_PLUGIN_CAPABILITY_TRANSFERS_READ: &str = "transfers.read";
pub const NATIVE_PLUGIN_CAPABILITY_IDE_READ: &str = "ide.read";
pub const NATIVE_PLUGIN_CAPABILITY_AI_CONTENT_READ: &str = "ai.content.read";
pub const NATIVE_PLUGIN_CAPABILITY_LEGACY_INVOKE: &str = "legacy.invoke";
pub const NATIVE_PLUGIN_CAPABILITY_EVENTS_EMIT: &str = "events.emit";
pub const NATIVE_PLUGIN_CAPABILITY_PLUGIN_SETTINGS_WRITE: &str = "plugin.settings.write";
pub const NATIVE_PLUGIN_CAPABILITY_UI_WRITE: &str = "ui.write";
