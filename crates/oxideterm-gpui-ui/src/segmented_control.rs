use std::time::Duration;

use gpui::{
    Animation, AnimationExt, AnyElement, Div, ElementId, IntoElement, Styled, div, prelude::*, px,
    relative, rgb, rgba,
};
use oxideterm_theme::ThemeTokens;

use crate::{color_for_background, theme_card_shadow, theme_glass_card_background_alpha};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SegmentedControlOptions {
    pub active_index: usize,
    pub previous_index: usize,
    pub item_count: usize,
    pub has_background_image: bool,
    pub layout: SegmentedControlLayout,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SegmentedControlLayout {
    Fill,
    Compact { width: f32 },
}

impl SegmentedControlOptions {
    pub const fn new(active_index: usize, previous_index: usize, item_count: usize) -> Self {
        Self {
            active_index,
            previous_index,
            item_count,
            has_background_image: false,
            layout: SegmentedControlLayout::Fill,
        }
    }

    pub const fn has_background_image(mut self, has_background_image: bool) -> Self {
        self.has_background_image = has_background_image;
        self
    }

    pub const fn compact(mut self, width: f32) -> Self {
        self.layout = SegmentedControlLayout::Compact { width };
        self
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SegmentedControlMotion {
    pub duration: Duration,
    pub spatial: bool,
}

/// Disabled motion returns no transition at all. Callers must not construct a
/// zero-duration GPUI animation because it still participates in scheduling.
pub fn segmented_control_motion(tokens: &ThemeTokens) -> Option<SegmentedControlMotion> {
    tokens.motion.enabled.then_some(SegmentedControlMotion {
        duration: Duration::from_millis(tokens.motion.normal_duration_ms),
        spatial: tokens.motion.spatial_enabled,
    })
}

pub fn segmented_control(
    tokens: &ThemeTokens,
    id: impl Into<ElementId>,
    options: SegmentedControlOptions,
    items: Vec<AnyElement>,
) -> Div {
    let item_count = options.item_count.max(1);
    let active_index = options.active_index.min(item_count - 1);
    let previous_index = options.previous_index.min(item_count - 1);
    let item_width = 1.0 / item_count as f32;
    let active_left = active_index as f32 * item_width;
    let previous_left = previous_index as f32 * item_width;
    // Initial rendering and repeated selection changes do not need a transition.
    let motion = (previous_index != active_index)
        .then(|| segmented_control_motion(tokens))
        .flatten();
    let animation_id = (id.into(), format!("{previous_index}-to-{active_index}"));
    // The outer control already supplies its inset. The moving highlight must
    // fill the option cell so its size matches the pre-animation selection.
    let indicator = div()
        .absolute()
        .top(px(0.0))
        .bottom(px(0.0))
        .w(relative(item_width))
        .rounded(px(tokens.radii.md));
    let indicator = match options.layout {
        SegmentedControlLayout::Fill => indicator.bg(rgba((tokens.ui.accent << 8) | 0x26)),
        SegmentedControlLayout::Compact { .. } => indicator
            .border_1()
            .border_color(color_for_background(
                tokens.ui.border,
                options.has_background_image,
                0xb3,
            ))
            .bg(color_for_background(
                tokens.ui.bg_panel,
                options.has_background_image,
                theme_glass_card_background_alpha(tokens),
            ))
            .shadow(theme_card_shadow(tokens)),
    };
    let indicator: AnyElement = match motion {
        None => indicator.left(relative(active_left)).into_any_element(),
        Some(motion) if !motion.spatial => indicator
            .left(relative(active_left))
            .with_animation(
                animation_id,
                Animation::new(motion.duration),
                |indicator, progress| indicator.opacity(progress),
            )
            .into_any_element(),
        Some(motion) => indicator
            .with_animation(
                animation_id,
                Animation::new(motion.duration).with_easing(crate::motion::ease_in_out_cubic),
                move |indicator, progress| {
                    indicator.left(relative(crate::motion::lerp(
                        previous_left,
                        active_left,
                        progress,
                    )))
                },
            )
            .into_any_element(),
    };

    let mut inner = div().relative().w_full().flex().flex_row().child(indicator);
    for item in items {
        inner = inner.child(item);
    }

    match options.layout {
        SegmentedControlLayout::Fill => div()
            .w_full()
            .rounded(px(tokens.radii.lg))
            .border_1()
            .border_color(rgb(tokens.ui.border))
            .bg(color_for_background(
                tokens.ui.bg_card,
                options.has_background_image,
                theme_glass_card_background_alpha(tokens),
            ))
            .shadow(theme_card_shadow(tokens))
            .p(px(8.0))
            .child(inner),
        SegmentedControlLayout::Compact { width } => {
            div().flex_none().w(px(width)).max_w_full().child(inner)
        }
    }
}

pub fn segmented_control_item(tokens: &ThemeTokens, label: String, active: bool) -> Div {
    segmented_control_item_content(
        tokens,
        active,
        div()
            .w_full()
            .text_align(gpui::TextAlign::Center)
            .child(label)
            .into_any_element(),
    )
}

pub fn segmented_control_item_content(
    tokens: &ThemeTokens,
    active: bool,
    child: AnyElement,
) -> Div {
    let theme = tokens.ui;
    div()
        .relative()
        .flex()
        .flex_1()
        .min_w(px(0.0))
        .items_center()
        .justify_center()
        .rounded(px(tokens.radii.md))
        .overflow_hidden()
        .px(px(12.0))
        .py(px(6.0))
        .whitespace_nowrap()
        .text_align(gpui::TextAlign::Center)
        .text_size(px(tokens.metrics.ui_text_sm))
        .text_color(if active {
            rgb(theme.accent)
        } else {
            rgb(theme.text_muted)
        })
        .cursor_pointer()
        .hover(move |style| {
            if active {
                style
            } else {
                style.bg(rgb(theme.bg_hover)).text_color(rgb(theme.text))
            }
        })
        .child(child)
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxideterm_theme::UiMotionProfile;

    #[test]
    fn motion_profiles_map_to_switcher_transitions_without_disabled_delay() {
        let mut tokens = oxideterm_theme::default_tokens();

        tokens.apply_motion(UiMotionProfile::Off);
        assert_eq!(segmented_control_motion(&tokens), None);

        tokens.apply_motion(UiMotionProfile::Reduced);
        let reduced = segmented_control_motion(&tokens).expect("reduced transition");
        assert!(!reduced.spatial);
        assert_eq!(reduced.duration, Duration::from_millis(120));

        tokens.apply_motion(UiMotionProfile::Normal);
        let normal = segmented_control_motion(&tokens).expect("normal transition");
        assert!(normal.spatial);
        assert_eq!(normal.duration, Duration::from_millis(200));

        tokens.apply_motion(UiMotionProfile::Fast);
        let fast = segmented_control_motion(&tokens).expect("fast transition");
        assert!(fast.spatial);
        assert_eq!(fast.duration, Duration::from_millis(110));
    }
}
