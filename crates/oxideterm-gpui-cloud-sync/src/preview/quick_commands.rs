// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;

pub(super) fn quick_command_changed_fields(
    before: &QuickCommand,
    after: &QuickCommand,
) -> Vec<CloudSyncFieldDiffField> {
    let mut fields = Vec::new();
    push_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.name",
        Some(before.name.clone()),
        Some(after.name.clone()),
    );
    push_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.command",
        Some(before.command.clone()),
        Some(after.command.clone()),
    );
    push_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.category",
        Some(before.category.clone()),
        Some(after.category.clone()),
    );
    push_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.description",
        before.description.clone(),
        after.description.clone(),
    );
    push_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.host_pattern",
        before.host_pattern.clone(),
        after.host_pattern.clone(),
    );
    fields
}

pub(super) fn quick_command_merge_fields(
    base: &QuickCommand,
    local: &QuickCommand,
    remote: &QuickCommand,
    effective: &QuickCommand,
    conflict_strategy: &ConflictStrategy,
) -> Vec<CloudSyncFieldDiffField> {
    let mut fields = Vec::new();
    push_merge_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.name",
        Some(base.name.clone()),
        Some(local.name.clone()),
        Some(remote.name.clone()),
        Some(effective.name.clone()),
        conflict_strategy,
    );
    push_merge_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.command",
        Some(base.command.clone()),
        Some(local.command.clone()),
        Some(remote.command.clone()),
        Some(effective.command.clone()),
        conflict_strategy,
    );
    push_merge_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.category",
        Some(base.category.clone()),
        Some(local.category.clone()),
        Some(remote.category.clone()),
        Some(effective.category.clone()),
        conflict_strategy,
    );
    push_merge_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.description",
        base.description.clone(),
        local.description.clone(),
        remote.description.clone(),
        effective.description.clone(),
        conflict_strategy,
    );
    push_merge_changed(
        &mut fields,
        "plugin.cloud_sync.diff_fields.host_pattern",
        base.host_pattern.clone(),
        local.host_pattern.clone(),
        remote.host_pattern.clone(),
        effective.host_pattern.clone(),
        conflict_strategy,
    );
    fields
}

pub(super) fn quick_command_summary_fields(value: &QuickCommand) -> Vec<CloudSyncFieldDiffField> {
    vec![
        field(
            "plugin.cloud_sync.diff_fields.command",
            None,
            Some(value.command.clone()),
        ),
        field(
            "plugin.cloud_sync.diff_fields.category",
            None,
            Some(value.category.clone()),
        ),
    ]
}
