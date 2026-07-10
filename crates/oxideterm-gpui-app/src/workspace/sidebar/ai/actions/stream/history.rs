// Settings adapters stay in the app because the domain crate does not depend on UI settings.
pub(in crate::workspace) fn ai_tool_use_policy_from_settings(
    settings: &oxideterm_settings::AiToolUseSettings,
) -> AiToolUsePolicy {
    tool_policy_from_parts(
        settings.enabled,
        settings
            .auto_approve_tools
            .iter()
            .filter_map(|(key, value)| value.as_bool().map(|enabled| (key.clone(), enabled))),
        settings.disabled_tools.clone(),
        settings.max_rounds,
        settings.max_calls_per_round,
    )
}

pub(in crate::workspace) fn ai_reasoning_effort_value(
    effort: oxideterm_settings::AiReasoningEffort,
) -> Option<String> {
    serde_json::to_value(effort)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .map(|value| match value.as_str() {
            "none" | "minimal" => "off".to_string(),
            "xhigh" => "max".to_string(),
            other => other.to_string(),
        })
}
