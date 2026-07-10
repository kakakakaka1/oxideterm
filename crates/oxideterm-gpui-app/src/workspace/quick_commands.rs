pub(super) use oxideterm_quick_commands::{
    MAX_CATEGORIES, QUICK_COMMANDS_SCHEMA_VERSION, QuickCommand, QuickCommandCategory,
    QuickCommandIcon, QuickCommandImportResult, QuickCommandImportStrategy, QuickCommandsSnapshot,
    default_quick_command_categories, default_quick_commands, new_quick_category_id,
    new_quick_command_id, now_ms,
};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub(super) enum QuickCommandInput {
    Search,
    CommandName,
    CommandText,
    CommandDescription,
    CommandHostPattern,
    CategoryName,
}

impl QuickCommandInput {
    pub(super) fn anchor_key(self) -> u64 {
        match self {
            Self::Search => 1,
            Self::CommandName => 2,
            Self::CommandText => 3,
            Self::CommandDescription => 4,
            Self::CommandHostPattern => 5,
            Self::CategoryName => 6,
        }
    }
}

fn quick_command_icon_source_id(icon: QuickCommandIcon) -> &'static str {
    match icon {
        QuickCommandIcon::Terminal => "terminal",
        QuickCommandIcon::Server => "server",
        QuickCommandIcon::Folder => "folder",
        QuickCommandIcon::Docker => "docker",
        QuickCommandIcon::Zap => "zap",
    }
}

#[derive(Clone, Debug)]
pub(super) struct QuickCommandDraft {
    pub id: Option<String>,
    pub name: String,
    pub command: String,
    pub category: String,
    pub description: String,
    pub host_pattern: String,
}

#[derive(Clone, Debug)]
pub(super) struct QuickCommandCategoryDraft {
    pub id: Option<String>,
    pub name: String,
    pub icon: QuickCommandIcon,
}

#[derive(Clone, Debug)]
pub(super) struct QuickCommandsState {
    settings_path: PathBuf,
    pub categories: Vec<QuickCommandCategory>,
    pub commands: Vec<QuickCommand>,
    pub active_category: String,
    pub query: String,
    pub focused_input: Option<QuickCommandInput>,
    // Browser popovers keep one active option for keyboard navigation without
    // stealing the row click target; store the stable command id instead of a
    // transient index so filtering and category changes cannot select a stale row.
    pub highlighted_command: Option<String>,
    pub command_editor: Option<QuickCommandDraft>,
    pub category_editor: Option<QuickCommandCategoryDraft>,
    pub last_persist_error: Option<String>,
}

#[path = "quick_commands_buttons.rs"]
mod buttons;
#[path = "quick_commands_store.rs"]
mod store;
#[path = "quick_commands_view.rs"]
mod view;

pub(in crate::workspace) use store::match_quick_command_host_pattern;
