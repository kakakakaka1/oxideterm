use super::*;
use flate2::{Compression, write::ZlibEncoder};
use std::io::Cursor;

#[test]
fn framebuffer_draws_bgra_rect() {
    let mut framebuffer = VncFramebuffer::new(2, 2);
    let rect = RfbRect {
        x: 1,
        y: 0,
        width: 1,
        height: 2,
    };

    assert_eq!(
        framebuffer.apply(VncServerEvent::RawImage(
            rect,
            vec![1, 2, 3, 255, 4, 5, 6, 255],
        )),
        Some(VncFramebufferChange::Rect(rect))
    );

    assert_eq!(
        framebuffer.frame().bytes,
        vec![0, 0, 0, 255, 1, 2, 3, 255, 0, 0, 0, 255, 4, 5, 6, 255]
    );
}

#[test]
fn framebuffer_treats_raw_padding_as_opaque_alpha() {
    let mut framebuffer = VncFramebuffer::new(1, 1);
    let rect = RfbRect {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
    };

    let _ = framebuffer.apply(VncServerEvent::RawImage(rect, vec![1, 2, 3, 0]));

    assert_eq!(framebuffer.frame().bytes, vec![1, 2, 3, 255]);
    assert_eq!(
        framebuffer.frame_update(rect).unwrap().bytes,
        vec![1, 2, 3, 255]
    );
}

#[test]
fn framebuffer_copies_rect_without_overlapping_corruption() {
    let mut framebuffer = VncFramebuffer::new(3, 1);
    let _ = framebuffer.apply(VncServerEvent::RawImage(
        RfbRect {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
        },
        vec![1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255],
    ));
    let dst = RfbRect {
        x: 1,
        y: 0,
        width: 2,
        height: 1,
    };

    assert_eq!(
        framebuffer.apply(VncServerEvent::CopyRect {
            dst,
            src_x: 0,
            src_y: 0,
        }),
        Some(VncFramebufferChange::Rect(dst))
    );

    assert_eq!(
        framebuffer.frame().bytes,
        vec![1, 0, 0, 255, 1, 0, 0, 255, 2, 0, 0, 255]
    );
}

#[test]
fn framebuffer_update_contains_only_changed_rect() {
    let mut framebuffer = VncFramebuffer::new(3, 2);
    let rect = RfbRect {
        x: 1,
        y: 1,
        width: 2,
        height: 1,
    };

    assert_eq!(
        framebuffer.apply(VncServerEvent::RawImage(
            rect,
            vec![7, 8, 9, 255, 10, 11, 12, 255],
        )),
        Some(VncFramebufferChange::Rect(rect))
    );

    let update = framebuffer.frame_update(rect).unwrap();
    assert_eq!(
        update.size,
        RemoteDesktopSize {
            width: 3,
            height: 2,
        }
    );
    assert_eq!(update.rect, RemoteDesktopRect::new(1, 1, 2, 1));
    assert_eq!(update.bytes, vec![7, 8, 9, 255, 10, 11, 12, 255]);
}

#[test]
fn set_encodings_prefers_zrle_and_hextile_before_raw() {
    let message = set_encodings_message();
    assert_eq!(&message[0..4], &[2, 0, 0, 7]);

    let encodings = message[4..].chunks_exact(4).map(be_i32).collect::<Vec<_>>();
    assert_eq!(
        encodings,
        vec![
            VNC_ENCODING_DESKTOP_SIZE,
            VNC_ENCODING_CURSOR,
            VNC_ENCODING_X_CURSOR,
            VNC_ENCODING_COPY_RECT,
            VNC_ENCODING_ZRLE,
            VNC_ENCODING_HEXTILE,
            VNC_ENCODING_RAW,
        ]
    );
}

#[test]
fn hextile_background_and_colored_subrect_decode_to_raw_rect() {
    let mut payload = vec![
        VNC_HEXTILE_BACKGROUND_SPECIFIED | VNC_HEXTILE_ANY_SUBRECTS | VNC_HEXTILE_SUBRECTS_COLORED,
        1,
        2,
        3,
        0,
        1,
        9,
        8,
        7,
        0,
        0x10,
        0x00,
    ];
    let mut reader = Cursor::new(payload.split_off(0));

    let bytes = read_hextile_rect(
        &mut reader,
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 2,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 9, 8, 7, 0, 1, 2, 3, 0, 1, 2, 3, 0]);
}

#[test]
fn hextile_raw_tile_decodes_without_background_state() {
    let mut payload = vec![VNC_HEXTILE_RAW, 1, 2, 3, 0, 4, 5, 6, 0];
    let mut reader = Cursor::new(payload.split_off(0));

    let bytes = read_hextile_rect(
        &mut reader,
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 4, 5, 6, 0]);
}

#[test]
fn hextile_rejects_out_of_bounds_subrect() {
    let mut payload = vec![
        VNC_HEXTILE_BACKGROUND_SPECIFIED | VNC_HEXTILE_ANY_SUBRECTS | VNC_HEXTILE_SUBRECTS_COLORED,
        1,
        2,
        3,
        0,
        1,
        9,
        8,
        7,
        0,
        0x10,
        0x10,
    ];
    let mut reader = Cursor::new(payload.split_off(0));

    let error = read_hextile_rect(
        &mut reader,
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
    )
    .unwrap_err();

    assert!(error.contains("subrect exceeds"));
}

#[test]
fn zrle_raw_tile_decodes_compact_pixels() {
    let bytes = decode_trle_rect(
        &[VNC_TRLE_RAW, 1, 2, 3, 4, 5, 6],
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 4, 5, 6, 0]);
}

#[test]
fn zrle_packed_palette_decodes_bit_indices() {
    let bytes = decode_trle_rect(
        &[2, 1, 2, 3, 9, 8, 7, 0b0100_0000],
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 9, 8, 7, 0]);
}

#[test]
fn zrle_plain_rle_decodes_run_lengths() {
    let bytes = decode_trle_rect(
        &[VNC_TRLE_PLAIN_RLE, 7, 8, 9, 2],
        RfbRect {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![7, 8, 9, 0, 7, 8, 9, 0, 7, 8, 9, 0]);
}

#[test]
fn zrle_palette_rle_decodes_single_pixels_and_runs() {
    let bytes = decode_trle_rect(
        &[130, 1, 2, 3, 9, 8, 7, 0, 0x81, 1],
        RfbRect {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
        },
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 9, 8, 7, 0, 9, 8, 7, 0]);
}

#[test]
fn zrle_rectangle_inflates_persistent_zlib_stream() {
    let trle = [VNC_TRLE_RAW, 1, 2, 3, 4, 5, 6];
    let compressed = zlib_payload(&trle);
    let mut payload = Vec::new();
    push_be_u32(&mut payload, compressed.len() as u32);
    payload.extend_from_slice(&compressed);
    let mut reader = Cursor::new(payload);
    let mut decode_state = VncDecodeState::default();

    let bytes = read_zrle_rect(
        &mut reader,
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
        &mut decode_state,
    )
    .unwrap();

    assert_eq!(bytes, vec![1, 2, 3, 0, 4, 5, 6, 0]);
}

#[test]
fn framebuffer_update_request_message_uses_incremental_flag() {
    assert_eq!(
        framebuffer_update_request_message(false, 800, 600),
        vec![3, 0, 0, 0, 0, 0, 3, 32, 2, 88]
    );
    assert_eq!(
        framebuffer_update_request_message(true, 800, 600),
        vec![3, 1, 0, 0, 0, 0, 3, 32, 2, 88]
    );
}

#[test]
fn forced_vnc_recovery_promotes_dirty_rect_to_base_frame() {
    let mut framebuffer = VncFramebuffer::new(2, 2);
    let rect = RfbRect {
        x: 1,
        y: 1,
        width: 1,
        height: 1,
    };
    let _ = framebuffer.apply(VncServerEvent::RawImage(rect, vec![9, 8, 7, 255]));
    let mut sent_initial_frame = true;

    let event = vnc_frame_event_for_change(
        &framebuffer,
        VncFramebufferChange::Rect(rect),
        &mut sent_initial_frame,
        true,
    );

    match event {
        RemoteDesktopHelperEvent::Frame { frame } => {
            assert_eq!(
                frame.size,
                RemoteDesktopSize {
                    width: 2,
                    height: 2,
                }
            );
            assert_eq!(frame.bytes.len(), 16);
        }
        other => panic!("expected forced base frame, got {other:?}"),
    }
    assert!(sent_initial_frame);
}

#[test]
fn ordinary_vnc_dirty_rect_stays_incremental_after_base_frame() {
    let mut framebuffer = VncFramebuffer::new(2, 2);
    let rect = RfbRect {
        x: 1,
        y: 1,
        width: 1,
        height: 1,
    };
    let _ = framebuffer.apply(VncServerEvent::RawImage(rect, vec![9, 8, 7, 255]));
    let mut sent_initial_frame = true;

    let event = vnc_frame_event_for_change(
        &framebuffer,
        VncFramebufferChange::Rect(rect),
        &mut sent_initial_frame,
        false,
    );

    match event {
        RemoteDesktopHelperEvent::FrameUpdate { update } => {
            assert_eq!(update.rect, RemoteDesktopRect::new(1, 1, 1, 1));
            assert_eq!(update.bytes, vec![9, 8, 7, 255]);
        }
        other => panic!("expected dirty update, got {other:?}"),
    }
    assert!(sent_initial_frame);
}

#[test]
fn rich_cursor_applies_visibility_mask_to_alpha() {
    let event = rich_cursor_event(
        RfbRect {
            x: 1,
            y: 0,
            width: 2,
            height: 1,
        },
        vec![10, 20, 30, 0, 40, 50, 60, 0],
        &[0b1000_0000],
    )
    .unwrap();

    let VncServerEvent::CursorShape(shape) = event else {
        panic!("expected cursor shape");
    };
    assert_eq!(
        shape,
        RemoteDesktopCursorShape::new(
            RemoteDesktopSize {
                width: 2,
                height: 1,
            },
            1,
            0,
            RemoteDesktopFrameFormat::Bgra8,
            vec![10, 20, 30, 255, 40, 50, 60, 0],
        )
    );
}

#[test]
fn x_cursor_expands_bitmap_and_mask_to_bgra_pixels() {
    let event = x_cursor_event(
        RfbRect {
            x: 0,
            y: 0,
            width: 2,
            height: 1,
        },
        [0x30, 0x20, 0x10, 0x03, 0x02, 0x01],
        &[0b1000_0000],
        &[0b1100_0000],
    )
    .unwrap();

    let VncServerEvent::CursorShape(shape) = event else {
        panic!("expected cursor shape");
    };
    assert_eq!(
        shape.bytes,
        vec![0x10, 0x20, 0x30, 255, 0x01, 0x02, 0x03, 255]
    );
    assert_eq!(shape.hotspot_x, 0);
    assert_eq!(shape.hotspot_y, 0);
}

#[test]
fn batch_exposes_nested_cursor_helper_events() {
    let shape = RemoteDesktopCursorShape::new(
        RemoteDesktopSize {
            width: 1,
            height: 1,
        },
        0,
        0,
        RemoteDesktopFrameFormat::Bgra8,
        vec![1, 2, 3, 255],
    );

    assert_eq!(
        vnc_helper_events(&VncServerEvent::Batch(vec![
            VncServerEvent::ClipboardText("copied".to_string()),
            VncServerEvent::CursorShape(shape.clone()),
            VncServerEvent::CursorHidden,
        ])),
        vec![
            RemoteDesktopHelperEvent::ClipboardText {
                text: "copied".to_string(),
            },
            RemoteDesktopHelperEvent::CursorShape { shape },
            RemoteDesktopHelperEvent::CursorHidden,
        ]
    );
}

#[test]
fn key_mapping_prefers_printable_text() {
    let key = RemoteDesktopKey {
        code: "KeyA".to_string(),
        text: Some("a".to_string()),
        alt: false,
        ctrl: false,
        shift: false,
        meta: false,
    };

    assert_eq!(vnc_keysym(&key), Some('a' as u32));
}

#[test]
fn key_mapping_accepts_physical_code_without_text() {
    let key = RemoteDesktopKey {
        code: "KeyV".to_string(),
        text: None,
        alt: false,
        ctrl: true,
        shift: false,
        meta: false,
    };

    assert_eq!(vnc_keysym(&key), Some('v' as u32));
}

#[test]
fn key_mapping_prefers_keypad_keysym_over_printable_text() {
    let key = RemoteDesktopKey {
        code: "Numpad1".to_string(),
        text: Some("1".to_string()),
        alt: false,
        ctrl: false,
        shift: false,
        meta: false,
    };

    assert_eq!(vnc_keysym(&key), Some(0xffb1));
}

#[test]
fn key_mapping_accepts_desktop_special_keys() {
    let cases = [
        ("Return", 0xff0d),
        ("EnterKey", 0xff0d),
        ("NumpadEnter", 0xff8d),
        ("KP_Enter", 0xff8d),
        ("NumpadDivide", 0xffaf),
        ("Insert", 0xff63),
        ("ContextMenu", 0xff67),
        ("PrintScreen", 0xff61),
        ("NumLock", 0xff7f),
        ("ScrollLock", 0xff14),
        ("Pause", 0xff13),
    ];

    for (code, expected) in cases {
        let key = RemoteDesktopKey {
            code: code.to_string(),
            text: None,
            alt: false,
            ctrl: false,
            shift: false,
            meta: false,
        };
        assert_eq!(vnc_keysym(&key), Some(expected), "code {code}");
    }
}

#[test]
fn key_events_wrap_modified_shortcut() {
    let key = RemoteDesktopKey {
        code: "KeyC".to_string(),
        text: Some("c".to_string()),
        alt: false,
        ctrl: true,
        shift: false,
        meta: false,
    };

    assert_eq!(
        vnc_key_events(&key, RemoteDesktopKeyState::Pressed),
        vec![
            VncKeyEvent {
                keysym: 0xffe3,
                down: true,
            },
            VncKeyEvent {
                keysym: 'c' as u32,
                down: true,
            },
        ]
    );
    assert_eq!(
        vnc_key_events(&key, RemoteDesktopKeyState::Released),
        vec![
            VncKeyEvent {
                keysym: 'c' as u32,
                down: false,
            },
            VncKeyEvent {
                keysym: 0xffe3,
                down: false,
            },
        ]
    );
}

#[test]
fn keyboard_mapper_keeps_physical_modifier_pressed_until_release() {
    let mut mapper = VncKeyboardInputMapper::default();
    let control = RemoteDesktopKey {
        code: "ControlRight".to_string(),
        text: None,
        alt: false,
        ctrl: true,
        shift: false,
        meta: false,
    };
    let shortcut = RemoteDesktopKey {
        code: "KeyV".to_string(),
        text: Some("v".to_string()),
        alt: false,
        ctrl: true,
        shift: false,
        meta: false,
    };

    assert_eq!(
        mapper.operations(&control, RemoteDesktopKeyState::Pressed),
        vec![VncKeyEvent {
            keysym: 0xffe4,
            down: true,
        }]
    );
    assert_eq!(
        mapper.operations(&shortcut, RemoteDesktopKeyState::Pressed),
        vec![VncKeyEvent {
            keysym: 'v' as u32,
            down: true,
        }]
    );
    assert_eq!(
        mapper.operations(&shortcut, RemoteDesktopKeyState::Released),
        vec![VncKeyEvent {
            keysym: 'v' as u32,
            down: false,
        }]
    );
}

#[test]
fn keyboard_mapper_release_all_releases_tracked_inputs() {
    let mut mapper = VncKeyboardInputMapper::default();
    let control = RemoteDesktopKey {
        code: "ControlLeft".to_string(),
        text: None,
        alt: false,
        ctrl: true,
        shift: false,
        meta: false,
    };
    let key = RemoteDesktopKey {
        code: "KeyA".to_string(),
        text: Some("a".to_string()),
        alt: false,
        ctrl: false,
        shift: false,
        meta: false,
    };

    let _ = mapper.operations(&control, RemoteDesktopKeyState::Pressed);
    let _ = mapper.operations(&key, RemoteDesktopKeyState::Pressed);
    let released = mapper.release_all_events();

    assert!(released.contains(&VncKeyEvent {
        keysym: 0xffe3,
        down: false,
    }));
    assert!(released.contains(&VncKeyEvent {
        keysym: 'a' as u32,
        down: false,
    }));
    assert!(mapper.release_all_events().is_empty());
}

#[test]
fn scroll_masks_include_horizontal_wheel_buttons() {
    assert_eq!(
        vnc_scroll_masks(RemoteDesktopWheelDelta {
            x: 120.0,
            y: -240.0
        }),
        vec![VNC_WHEEL_UP, VNC_WHEEL_UP, VNC_WHEEL_RIGHT]
    );
    assert_eq!(
        vnc_scroll_masks(RemoteDesktopWheelDelta { x: -1.0, y: 0.0 }),
        vec![VNC_WHEEL_LEFT]
    );
}

#[test]
fn vnc_error_category_identifies_authentication_and_network_errors() {
    assert_eq!(
        vnc_error_category_from_message("VNC password authentication failed."),
        RemoteDesktopErrorCategory::Authentication
    );
    assert_eq!(
        vnc_error_category_from_message("VNC TCP connection failed: refused"),
        RemoteDesktopErrorCategory::Network
    );
    assert_eq!(
        vnc_error_category_from_message("VNC security list read failed: timed out"),
        RemoteDesktopErrorCategory::Network
    );
}

#[test]
fn vnc_error_category_separates_security_configuration_and_protocol_errors() {
    assert_eq!(
        vnc_error_category_from_message("Unsupported VNC security types: [19]."),
        RemoteDesktopErrorCategory::LegacySecurity
    );
    assert_eq!(
        vnc_error_category_from_message("VNC helper received a non-VNC connect request."),
        RemoteDesktopErrorCategory::Configuration
    );
    assert_eq!(
        vnc_error_category_from_message("Unsupported VNC rectangle encoding 99."),
        RemoteDesktopErrorCategory::Protocol
    );
}

#[test]
fn vnc_server_event_summary_counts_metadata_without_payloads() {
    let rect = RfbRect {
        x: 0,
        y: 0,
        width: 4,
        height: 3,
    };
    let summary = vnc_server_event_summary(&VncServerEvent::Batch(vec![
        VncServerEvent::RawImage(rect, vec![1; 48]),
        VncServerEvent::CursorHidden,
    ]));

    assert_eq!(
        summary,
        VncServerEventSummary {
            dirty_rects: 1,
            dirty_pixels: 12,
            side_events: 1,
        }
    );
}

#[test]
fn vnc_auth_key_reverses_bits_and_truncates_password() {
    let secret = RemoteDesktopSecret::from("abcdefghijk");

    assert_eq!(
        vnc_auth_key(&secret).as_slice(),
        &[0x86, 0x46, 0xc6, 0x26, 0xa6, 0x66, 0xe6, 0x16]
    );
}

fn zlib_payload(data: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(data).unwrap();
    encoder.finish().unwrap()
}
