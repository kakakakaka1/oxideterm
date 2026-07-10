use std::path::Path;

use super::{
    MAX_CATEGORIES, QUICK_COMMANDS_SCHEMA_VERSION, QuickCommand, QuickCommandCategory,
    QuickCommandCategoryDraft, QuickCommandDraft, QuickCommandImportResult,
    QuickCommandImportStrategy, QuickCommandsSnapshot, QuickCommandsState,
    default_quick_command_categories, default_quick_commands, new_quick_category_id,
    new_quick_command_id, now_ms,
};

impl QuickCommandsState {
    pub(in crate::workspace) fn load(settings_path: &Path) -> Self {
        let mut state = Self {
            settings_path: settings_path.to_path_buf(),
            categories: default_quick_command_categories(),
            commands: default_quick_commands(),
            active_category: "system".to_string(),
            query: String::new(),
            focused_input: None,
            highlighted_command: None,
            command_editor: None,
            category_editor: None,
            last_persist_error: None,
        };

        match oxideterm_quick_commands::load_snapshot(settings_path) {
            Ok(snapshot) => {
                state.categories = snapshot.categories;
                state.commands = snapshot.commands;
                state.ensure_active_category();
            }
            Err(error) => {
                state.last_persist_error = Some(error);
            }
        }
        state
    }

    #[allow(dead_code)]
    pub(super) fn visible_commands(&self) -> Vec<QuickCommand> {
        self.visible_commands_for_targets(&[])
    }

    pub(super) fn visible_commands_for_targets(
        &self,
        target_fields: &[String],
    ) -> Vec<QuickCommand> {
        let query = self.query.trim().to_lowercase();
        self.commands
            .iter()
            .filter(|command| command.category == self.active_category)
            .filter(|command| {
                match_quick_command_host_pattern(command.host_pattern.as_deref(), target_fields)
            })
            .filter(|command| {
                query.is_empty()
                    || command.name.to_lowercase().contains(&query)
                    || command.command.to_lowercase().contains(&query)
                    || command
                        .description
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(&query)
            })
            .cloned()
            .collect()
    }

    pub(super) fn upsert_command(&mut self, draft: QuickCommandDraft) {
        let now = now_ms();
        let existing = draft
            .id
            .as_ref()
            .and_then(|id| self.commands.iter().find(|command| &command.id == id));
        let command = QuickCommand {
            id: draft.id.unwrap_or_else(new_quick_command_id),
            name: draft.name.trim().to_string(),
            command: draft.command.trim().to_string(),
            category: if self.categories.iter().any(|c| c.id == draft.category) {
                draft.category
            } else {
                "custom".to_string()
            },
            description: trim_optional(&draft.description),
            host_pattern: trim_optional(&draft.host_pattern),
            created_at: existing.map(|command| command.created_at).unwrap_or(now),
            updated_at: now,
        };
        if command.name.is_empty() || command.command.is_empty() {
            return;
        }
        if self
            .commands
            .iter()
            .any(|candidate| candidate.id == command.id)
        {
            self.commands = self
                .commands
                .iter()
                .map(|candidate| {
                    if candidate.id == command.id {
                        command.clone()
                    } else {
                        candidate.clone()
                    }
                })
                .collect();
        } else {
            self.commands.push(command);
        }
        self.persist();
    }

    pub(super) fn delete_command(&mut self, id: &str) {
        self.commands.retain(|command| command.id != id);
        self.persist();
    }

    pub(super) fn upsert_category(&mut self, draft: QuickCommandCategoryDraft) -> String {
        let category = QuickCommandCategory {
            id: draft.id.unwrap_or_else(new_quick_category_id),
            name: draft.name.trim().to_string(),
            icon: draft.icon,
        };
        if category.name.is_empty() {
            return self.active_category.clone();
        }
        if self
            .categories
            .iter()
            .any(|candidate| candidate.id == category.id)
        {
            self.categories = self
                .categories
                .iter()
                .map(|candidate| {
                    if candidate.id == category.id {
                        category.clone()
                    } else {
                        candidate.clone()
                    }
                })
                .collect();
        } else if self.categories.len() < MAX_CATEGORIES {
            self.categories.push(category.clone());
        }
        self.active_category = category.id.clone();
        self.persist();
        category.id
    }

    pub(super) fn delete_category(&mut self, id: &str) -> bool {
        if default_quick_command_categories()
            .iter()
            .any(|category| category.id == id)
            || self.commands.iter().any(|command| command.category == id)
        {
            return false;
        }
        let before = self.categories.len();
        self.categories.retain(|category| category.id != id);
        if self.categories.len() == before {
            return false;
        }
        self.ensure_active_category();
        self.persist();
        true
    }

    #[allow(dead_code)]
    pub(super) fn reset_defaults(&mut self) {
        self.categories = default_quick_command_categories();
        self.commands = default_quick_commands();
        self.active_category = "system".to_string();
        self.highlighted_command = None;
        self.command_editor = None;
        self.category_editor = None;
        self.persist();
    }

    #[allow(dead_code)]
    pub(in crate::workspace) fn export_snapshot_json(&self) -> Result<String, String> {
        oxideterm_quick_commands::export_snapshot_json(&self.settings_path)
    }

    #[allow(dead_code)]
    pub(in crate::workspace) fn apply_snapshot_json(
        &mut self,
        snapshot_json: &str,
        strategy: QuickCommandImportStrategy,
    ) -> QuickCommandImportResult {
        let result = oxideterm_quick_commands::apply_snapshot_json(
            &self.settings_path,
            snapshot_json,
            strategy,
        );
        if result.errors.is_empty() {
            self.reload_from_store();
        }
        result
    }

    pub(in crate::workspace) fn reload_from_store(&mut self) {
        match oxideterm_quick_commands::load_snapshot(&self.settings_path) {
            Ok(snapshot) => {
                self.categories = snapshot.categories;
                self.commands = snapshot.commands;
                self.ensure_active_category();
                self.highlighted_command = self
                    .highlighted_command
                    .take()
                    .filter(|id| self.commands.iter().any(|command| command.id == *id));
                self.last_persist_error = None;
            }
            Err(error) => self.last_persist_error = Some(error),
        }
    }

    fn snapshot(&self) -> QuickCommandsSnapshot {
        QuickCommandsSnapshot {
            version: QUICK_COMMANDS_SCHEMA_VERSION,
            categories: self.categories.clone(),
            commands: self.commands.clone(),
            updated_at: now_ms(),
        }
    }

    fn persist(&mut self) {
        let snapshot = self.snapshot();
        self.last_persist_error =
            oxideterm_quick_commands::save_snapshot(&self.settings_path, &snapshot).err();
    }

    fn ensure_active_category(&mut self) {
        if !self
            .categories
            .iter()
            .any(|category| category.id == self.active_category)
        {
            self.active_category = self
                .categories
                .first()
                .map(|category| category.id.clone())
                .unwrap_or_else(|| "custom".to_string());
        }
    }
}

fn trim_optional(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(test)]
mod quick_command_tests {
    use super::{
        QUICK_COMMANDS_SCHEMA_VERSION, QuickCommand, QuickCommandCategory,
        QuickCommandCategoryDraft, QuickCommandDraft, QuickCommandImportStrategy,
        QuickCommandsSnapshot, QuickCommandsState, default_quick_command_categories,
        default_quick_commands, now_ms,
    };
    use crate::workspace::quick_commands::QuickCommandIcon;
    use std::fs;
    use std::path::PathBuf;

    fn temp_settings_path(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oxideterm-quick-commands-{name}-{}", now_ms()));
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn upsert_command_persists_to_quick_commands_json() {
        let settings_path = temp_settings_path("persist");
        let mut state = QuickCommandsState::load(&settings_path);
        state.upsert_command(QuickCommandDraft {
            id: None,
            name: "List root".to_string(),
            command: "ls /".to_string(),
            category: "files".to_string(),
            description: "root listing".to_string(),
            host_pattern: String::new(),
        });

        let reloaded = QuickCommandsState::load(&settings_path);
        assert!(reloaded.commands.iter().any(|command| {
            command.name == "List root"
                && command.command == "ls /"
                && command.description.as_deref() == Some("root listing")
        }));
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn default_categories_cannot_be_deleted_while_custom_empty_categories_can() {
        let settings_path = temp_settings_path("delete-category");
        let mut state = QuickCommandsState::load(&settings_path);
        assert!(!state.delete_category("system"));
        let custom = state.upsert_category(QuickCommandCategoryDraft {
            id: None,
            name: "Ops".to_string(),
            icon: QuickCommandIcon::Zap,
        });
        assert!(state.delete_category(&custom));
        assert!(
            !state
                .categories
                .iter()
                .any(|category| category.id == custom)
        );
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn upsert_category_allows_multiple_user_custom_groups() {
        let settings_path = temp_settings_path("multiple-custom-groups");
        let mut state = QuickCommandsState::load(&settings_path);

        let first = state.upsert_category(QuickCommandCategoryDraft {
            id: None,
            name: "Custom".to_string(),
            icon: QuickCommandIcon::Zap,
        });
        let second = state.upsert_category(QuickCommandCategoryDraft {
            id: None,
            name: "Custom".to_string(),
            icon: QuickCommandIcon::Zap,
        });

        assert_ne!(first, second);
        assert_ne!(first, "custom");
        assert_ne!(second, "custom");
        assert_eq!(state.active_category, second);
        assert_eq!(
            state
                .categories
                .iter()
                .filter(|category| category.name == "Custom")
                .count(),
            3
        );

        let reloaded = QuickCommandsState::load(&settings_path);
        assert!(
            reloaded
                .categories
                .iter()
                .any(|category| category.id == first)
        );
        assert!(
            reloaded
                .categories
                .iter()
                .any(|category| category.id == second)
        );
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn import_snapshot_rename_preserves_conflicting_existing_command() {
        let settings_path = temp_settings_path("import-rename");
        let mut state = QuickCommandsState::load(&settings_path);
        let snapshot = QuickCommandsSnapshot {
            version: QUICK_COMMANDS_SCHEMA_VERSION,
            categories: vec![QuickCommandCategory {
                id: "files".to_string(),
                name: "Files".to_string(),
                icon: QuickCommandIcon::Folder,
            }],
            commands: vec![QuickCommand {
                id: "qc-ls-la".to_string(),
                name: "List Files".to_string(),
                command: "exa -la".to_string(),
                category: "files".to_string(),
                description: None,
                host_pattern: None,
                created_at: 1,
                updated_at: 1,
            }],
            updated_at: 1,
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        let result = state.apply_snapshot_json(&json, QuickCommandImportStrategy::Rename);

        assert_eq!(result.errors, Vec::<String>::new());
        assert!(result.imported > 0);
        assert!(
            state
                .commands
                .iter()
                .any(|command| command.command == "ls -la")
        );
        assert!(
            state
                .commands
                .iter()
                .any(|command| command.command == "exa -la")
        );
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn import_snapshot_rename_does_not_duplicate_builtin_roundtrip_records() {
        let settings_path = temp_settings_path("import-rename-roundtrip");
        let mut state = QuickCommandsState::load(&settings_path);
        let json = state.export_snapshot_json().unwrap();

        let result = state.apply_snapshot_json(&json, QuickCommandImportStrategy::Rename);

        assert_eq!(result.errors, Vec::<String>::new());
        assert_eq!(result.imported, 0);
        assert_eq!(
            state.categories.len(),
            default_quick_command_categories().len()
        );
        assert_eq!(state.commands.len(), default_quick_commands().len());
        assert_eq!(
            state
                .categories
                .iter()
                .filter(|category| category.id == "system")
                .count(),
            1
        );

        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }

    #[test]
    fn reload_from_store_observes_external_structured_sync_write() {
        let settings_path = temp_settings_path("external-sync");
        let mut state = QuickCommandsState::load(&settings_path);
        let mut snapshot = oxideterm_quick_commands::load_snapshot(&settings_path).unwrap();
        snapshot.commands.push(QuickCommand {
            id: "qc-synced".to_string(),
            name: "Synced command".to_string(),
            command: "echo synced".to_string(),
            category: "custom".to_string(),
            description: None,
            host_pattern: None,
            created_at: 1,
            updated_at: 1,
        });
        oxideterm_quick_commands::save_snapshot(&settings_path, &snapshot).unwrap();

        state.reload_from_store();

        assert!(
            state
                .commands
                .iter()
                .any(|command| command.id == "qc-synced")
        );
        let _ = fs::remove_dir_all(settings_path.parent().unwrap());
    }
}

pub(in crate::workspace) fn match_quick_command_host_pattern(
    pattern: Option<&str>,
    target_fields: &[String],
) -> bool {
    let Some(pattern) = pattern.map(str::trim).filter(|pattern| !pattern.is_empty()) else {
        return true;
    };
    let pattern = pattern.to_lowercase();
    target_fields.iter().any(|field| {
        let field = field.to_lowercase();
        wildcard_match(&pattern, &field)
    })
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let parts = pattern.split('*').collect::<Vec<_>>();
    if parts.len() == 1 {
        return pattern == value;
    }
    let mut cursor = 0;
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        let Some(found) = value[cursor..].find(part) else {
            return false;
        };
        if index == 0 && found != 0 {
            return false;
        }
        cursor += found + part.len();
    }
    pattern.ends_with('*') || parts.last().is_none_or(|last| value.ends_with(last))
}
