import { describe, expect, it } from 'vitest';

import {
  TERMINAL_PASTE_SHORTCUT_SUPPRESSION_MS,
  armTerminalPasteShortcutSuppression,
  clearTerminalPasteShortcutSuppression,
  createTerminalPasteShortcutSuppressionState,
  markTerminalPasteShortcutHandled,
  shouldSuppressTerminalPasteEvent,
  takeTerminalPasteShortcutFallback,
} from '@/lib/terminalPasteShortcutGuard';

describe('terminalPasteShortcutGuard', () => {
  it('suppresses the next native paste event inside the shortcut window', () => {
    const ref = { current: createTerminalPasteShortcutSuppressionState() };

    armTerminalPasteShortcutSuppression(ref, 1_000);

    expect(shouldSuppressTerminalPasteEvent(ref, 'hello', 1_050)).toBe(true);
    expect(ref.current.capturedNativeText).toBe('hello');
  });

  it('does not suppress after the shortcut window expires', () => {
    const ref = { current: createTerminalPasteShortcutSuppressionState() };

    armTerminalPasteShortcutSuppression(ref, 1_000);

    expect(
      shouldSuppressTerminalPasteEvent(ref, 'late', 1_000 + TERMINAL_PASTE_SHORTCUT_SUPPRESSION_MS + 1),
    ).toBe(false);
    expect(ref.current).toEqual(createTerminalPasteShortcutSuppressionState());
  });

  it('consumes at most one native paste event per shortcut arm', () => {
    const ref = { current: createTerminalPasteShortcutSuppressionState() };

    armTerminalPasteShortcutSuppression(ref, 2_000);

    expect(shouldSuppressTerminalPasteEvent(ref, 'first', 2_010)).toBe(true);
    markTerminalPasteShortcutHandled(ref);
    clearTerminalPasteShortcutSuppression(ref);
    expect(shouldSuppressTerminalPasteEvent(ref, 'second', 2_020)).toBe(false);
  });

  it('returns a captured native paste fallback when the manual clipboard path fails', () => {
    const ref = { current: createTerminalPasteShortcutSuppressionState() };

    armTerminalPasteShortcutSuppression(ref, 3_000);
    expect(shouldSuppressTerminalPasteEvent(ref, 'native text', 3_010)).toBe(true);

    expect(takeTerminalPasteShortcutFallback(ref)).toBe('native text');
    expect(ref.current).toEqual(createTerminalPasteShortcutSuppressionState());
  });

  it('keeps suppressing duplicates after the manual shortcut path succeeds', () => {
    const ref = { current: createTerminalPasteShortcutSuppressionState() };

    armTerminalPasteShortcutSuppression(ref, 4_000);
    markTerminalPasteShortcutHandled(ref);

    expect(shouldSuppressTerminalPasteEvent(ref, 'duplicate', 4_020)).toBe(true);
    expect(ref.current.manualHandled).toBe(true);
    expect(takeTerminalPasteShortcutFallback(ref)).toBe(null);
  });
});