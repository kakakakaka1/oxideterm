use super::*;

pub(in crate::workspace) const TERMINAL_SETTINGS_SWITCHER_ID: &str =
    "terminal-settings-page-switcher";
pub(in crate::workspace) const AI_SETTINGS_SWITCHER_ID: &str = "ai-settings-page-switcher";
pub(in crate::workspace) const CLOUD_SYNC_SWITCHER_ID: &str = "cloud-sync-tab-bar";
pub(in crate::workspace) const PLUGIN_MANAGER_SWITCHER_ID: &str = "plugin-manager-tab-bar";
pub(in crate::workspace) const CONNECTION_RUNTIME_SWITCHER_ID: &str = "connection-runtime-tab-bar";
pub(in crate::workspace) const NOTIFICATION_CENTER_SWITCHER_ID: &str =
    "notification-center-tab-bar";

#[derive(Default)]
pub(super) struct UserSegmentedControlMotionState {
    next_generation: u64,
    active_transitions: HashMap<&'static str, ActiveUserTransition>,
}

#[derive(Clone, Copy)]
struct ActiveUserTransition {
    generation: u64,
    target_index: usize,
}

impl UserSegmentedControlMotionState {
    fn begin(&mut self, control_id: &'static str, target_index: usize) -> u64 {
        // One monotonic counter prevents a cleared control from reusing a
        // generation while its older completion task is still pending.
        self.next_generation = self.next_generation.wrapping_add(1).max(1);
        let generation = self.next_generation;
        self.active_transitions.insert(
            control_id,
            ActiveUserTransition {
                generation,
                target_index,
            },
        );
        generation
    }

    fn finish(&mut self, control_id: &'static str, generation: u64) -> bool {
        if self
            .active_transitions
            .get(control_id)
            .map(|transition| transition.generation)
            != Some(generation)
        {
            return false;
        }
        self.active_transitions.remove(control_id);
        true
    }

    fn clear(&mut self, control_id: &'static str) {
        self.active_transitions.remove(control_id);
    }

    fn is_active_for(&self, control_id: &'static str, active_index: usize) -> bool {
        self.active_transitions
            .get(control_id)
            .is_some_and(|transition| transition.target_index == active_index)
    }
}

impl WorkspaceApp {
    pub(in crate::workspace) fn begin_user_segmented_control_transition(
        &mut self,
        control_id: &'static str,
        target_index: usize,
        cx: &mut Context<Self>,
    ) {
        let Some(motion) = oxideterm_gpui_ui::segmented_control_motion(&self.tokens) else {
            self.segmented_control_user_motion.clear(control_id);
            return;
        };
        let generation = self
            .segmented_control_user_motion
            .begin(control_id, target_index);
        // User intent outlives a virtual-list row only for the real transition,
        // then expires so remounts and programmatic navigation render settled.
        cx.spawn(async move |weak, cx| {
            Timer::after(motion.duration).await;
            let _ = weak.update(cx, |this, cx| {
                if this
                    .segmented_control_user_motion
                    .finish(control_id, generation)
                {
                    cx.notify();
                }
            });
        })
        .detach();
    }

    pub(in crate::workspace) fn segmented_control_user_transition_active(
        &self,
        control_id: &'static str,
        active_index: usize,
    ) -> bool {
        self.segmented_control_user_motion
            .is_active_for(control_id, active_index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_transition_generation_cannot_finish_a_newer_selection() {
        let mut state = UserSegmentedControlMotionState::default();
        let first = state.begin(TERMINAL_SETTINGS_SWITCHER_ID, 1);
        let second = state.begin(TERMINAL_SETTINGS_SWITCHER_ID, 2);

        assert!(!state.finish(TERMINAL_SETTINGS_SWITCHER_ID, first));
        assert!(state.is_active_for(TERMINAL_SETTINGS_SWITCHER_ID, 2));
        assert!(state.finish(TERMINAL_SETTINGS_SWITCHER_ID, second));
        assert!(!state.is_active_for(TERMINAL_SETTINGS_SWITCHER_ID, 2));
    }

    #[test]
    fn clearing_a_transition_makes_remount_render_settled() {
        let mut state = UserSegmentedControlMotionState::default();
        let cleared_generation = state.begin(AI_SETTINGS_SWITCHER_ID, 1);

        state.clear(AI_SETTINGS_SWITCHER_ID);
        let replacement_generation = state.begin(AI_SETTINGS_SWITCHER_ID, 2);

        assert_ne!(cleared_generation, replacement_generation);
        assert!(!state.finish(AI_SETTINGS_SWITCHER_ID, cleared_generation));
        assert!(state.is_active_for(AI_SETTINGS_SWITCHER_ID, 2));
    }

    #[test]
    fn programmatic_target_change_does_not_reuse_user_transition() {
        let mut state = UserSegmentedControlMotionState::default();
        state.begin(CLOUD_SYNC_SWITCHER_ID, 1);

        assert!(state.is_active_for(CLOUD_SYNC_SWITCHER_ID, 1));
        assert!(!state.is_active_for(CLOUD_SYNC_SWITCHER_ID, 2));
    }

    #[test]
    fn repeated_user_transitions_replace_one_bounded_control_slot() {
        let mut state = UserSegmentedControlMotionState::default();

        for target_index in 0..1_000 {
            state.begin(PLUGIN_MANAGER_SWITCHER_ID, target_index);
        }

        assert_eq!(state.active_transitions.len(), 1);
        assert!(state.is_active_for(PLUGIN_MANAGER_SWITCHER_ID, 999));
    }
}
