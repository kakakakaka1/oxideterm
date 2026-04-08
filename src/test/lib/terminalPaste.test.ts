import { describe, expect, it } from 'vitest';

import {
  getProtectedPasteDecision,
  shouldConfirmPaste,
} from '@/lib/terminalPaste';

describe('shouldConfirmPaste', () => {
  it('returns true for multiline content', () => {
    expect(shouldConfirmPaste('first line\nsecond line')).toBe(true);
  });

  it('returns false for single-line content', () => {
    expect(shouldConfirmPaste('echo hello')).toBe(false);
  });
});

describe('getProtectedPasteDecision', () => {
  it('blocks paste when the terminal is not interactive', () => {
    expect(getProtectedPasteDecision('line 1\nline 2', false)).toBe('block');
  });

  it('confirms protected multiline paste when interactive', () => {
    expect(getProtectedPasteDecision('line 1\nline 2', true)).toBe('confirm');
  });

  it('passes single-line input through when interactive', () => {
    expect(getProtectedPasteDecision('pwd', true)).toBe('passthrough');
  });

  it('passes through empty clipboard payloads', () => {
    expect(getProtectedPasteDecision('', true)).toBe('passthrough');
    expect(getProtectedPasteDecision(null, false)).toBe('passthrough');
  });
});