// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

export const TERMINAL_PASTE_SHORTCUT_SUPPRESSION_MS = 150;

export type TerminalPasteShortcutSuppressionState = {
  until: number;
  capturedNativeText: string | null;
  manualHandled: boolean;
};

type StateRef = { current: TerminalPasteShortcutSuppressionState };

export function createTerminalPasteShortcutSuppressionState(): TerminalPasteShortcutSuppressionState {
  return {
    until: 0,
    capturedNativeText: null,
    manualHandled: false,
  };
}

export function clearTerminalPasteShortcutSuppression(ref: StateRef): void {
  ref.current = createTerminalPasteShortcutSuppressionState();
}

export function armTerminalPasteShortcutSuppression(
  ref: StateRef,
  now = Date.now(),
  durationMs = TERMINAL_PASTE_SHORTCUT_SUPPRESSION_MS,
): void {
  ref.current = {
    until: now + durationMs,
    capturedNativeText: null,
    manualHandled: false,
  };
}

export function markTerminalPasteShortcutHandled(ref: StateRef): void {
  if (ref.current.until <= 0) {
    return;
  }

  ref.current = {
    ...ref.current,
    capturedNativeText: null,
    manualHandled: true,
  };
}

export function shouldSuppressTerminalPasteEvent(
  ref: StateRef,
  text: string | null | undefined,
  now = Date.now(),
): boolean {
  if (ref.current.until <= 0) {
    return false;
  }

  if (now > ref.current.until) {
    clearTerminalPasteShortcutSuppression(ref);
    return false;
  }

  if (!ref.current.manualHandled && text) {
    ref.current = {
      ...ref.current,
      capturedNativeText: text,
    };
  }

  return true;
}

export function takeTerminalPasteShortcutFallback(ref: StateRef): string | null {
  const fallback = ref.current.capturedNativeText;
  clearTerminalPasteShortcutSuppression(ref);
  return fallback;
}