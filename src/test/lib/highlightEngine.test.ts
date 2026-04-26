import { describe, expect, it } from 'vitest';

import { __testOnly } from '@/lib/terminal/highlightEngine';
import type { RuntimeHighlightRule } from '@/lib/terminal/highlightPattern';

function createRule(overrides: Partial<RuntimeHighlightRule> = {}): RuntimeHighlightRule {
  return {
    id: 'rule-1',
    label: 'Rule',
    pattern: 'pattern',
    isRegex: false,
    caseSensitive: false,
    foreground: '#eff6ff',
    background: '#1d4ed8',
    renderMode: 'background',
    enabled: true,
    priority: 1,
    normalizedPriority: 1,
    ...overrides,
  };
}

describe('highlightEngine decoration overlay styles', () => {
  it('does not paint a DOM background overlay for background mode', () => {
    const element = document.createElement('div');

    __testOnly.applyDecorationClasses(element, createRule());

    expect(element.classList.contains('xterm-highlight-decoration')).toBe(true);
    expect(element.classList.contains('xterm-highlight-background')).toBe(false);
    expect(element.style.backgroundColor).toBe('');
    expect(element.style.getPropertyValue('--xterm-highlight-bg')).toBe('');
    expect(element.style.getPropertyValue('--xterm-highlight-fg')).toBe('');
  });

  it('keeps overlay classes for underline and outline modes', () => {
    const underlineElement = document.createElement('div');
    const outlineElement = document.createElement('div');

    __testOnly.applyDecorationClasses(underlineElement, createRule({ renderMode: 'underline' }));
    __testOnly.applyDecorationClasses(outlineElement, createRule({ renderMode: 'outline' }));

    expect(underlineElement.classList.contains('xterm-highlight-underline')).toBe(true);
    expect(outlineElement.classList.contains('xterm-highlight-outline')).toBe(true);
    expect(underlineElement.style.getPropertyValue('--xterm-highlight-bg')).toBe('#1d4ed8');
    expect(outlineElement.style.getPropertyValue('--xterm-highlight-fg')).toBe('#eff6ff');
  });

  it('treats touching terminal row windows as overlapping inclusively', () => {
    expect(__testOnly.rowsOverlap(10, 20, 20, 30)).toBe(true);
    expect(__testOnly.rowsOverlap(10, 20, 21, 30)).toBe(false);
    expect(__testOnly.rowsOverlap(10, 20, 0, 10)).toBe(true);
  });

  it('keeps terminal active highlight scan idle gate responsive', () => {
    expect(__testOnly.TERMINAL_ACTIVE_SCAN_IDLE_MS).toBeGreaterThanOrEqual(80);
    expect(__testOnly.TERMINAL_ACTIVE_SCAN_IDLE_MS).toBeLessThanOrEqual(250);
  });
});
