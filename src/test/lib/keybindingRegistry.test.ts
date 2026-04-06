import { describe, expect, it } from 'vitest';
import {
  combosEqual,
  eventMatchesCombo,
  normalizeKeyCombo,
  type KeyCombo,
} from '@/lib/keybindingRegistry';

function keyboardEvent(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe('keybindingRegistry international layout compatibility', () => {
  it('normalizes layout-generated alt for ctrl/meta symbol shortcuts', () => {
    const combo: KeyCombo = {
      key: '[',
      ctrl: false,
      shift: false,
      alt: true,
      meta: true,
    };

    expect(normalizeKeyCombo(combo)).toEqual({
      key: '[',
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
    });
  });

  it('matches Cmd+[ when an international layout requires Option to produce the bracket', () => {
    const event = keyboardEvent({
      key: '[',
      metaKey: true,
      altKey: true,
    });

    expect(eventMatchesCombo(event, {
      key: '[',
      ctrl: false,
      shift: false,
      alt: false,
      meta: true,
    })).toBe(true);
  });

  it('matches Ctrl+\\ when an international layout requires AltGr or Option', () => {
    const event = keyboardEvent({
      key: '\\',
      ctrlKey: true,
      altKey: true,
    });

    expect(eventMatchesCombo(event, {
      key: '\\',
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
    })).toBe(true);
  });

  it('keeps explicit alt on non-layout symbol shortcuts distinct', () => {
    expect(combosEqual(
      {
        key: '/',
        ctrl: true,
        shift: false,
        alt: true,
        meta: false,
      },
      {
        key: '/',
        ctrl: true,
        shift: false,
        alt: false,
        meta: false,
      },
    )).toBe(false);
  });
});