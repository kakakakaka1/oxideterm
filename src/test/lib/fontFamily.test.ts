// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getFontFamily } from '@/lib/fontFamily';

describe('getFontFamily', () => {
  it('places Latin Extended fallbacks before the CJK fallback for JetBrains Mono', () => {
    const stack = getFontFamily('jetbrains');

    const latinFallbackIndex = stack.indexOf('ui-monospace');
    const cjkFallbackIndex = stack.indexOf('"Maple Mono NF CN (Subset)"');

    expect(stack).toContain('"JetBrains Mono NF (Subset)"');
    expect(latinFallbackIndex).toBeGreaterThan(-1);
    expect(cjkFallbackIndex).toBeGreaterThan(-1);
    expect(latinFallbackIndex).toBeLessThan(cjkFallbackIndex);
  });

  it('preserves custom font stacks while appending terminal fallbacks', () => {
    expect(getFontFamily('custom', '"Iosevka Term", monospace')).toBe(
      '"Iosevka Term", ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", "Courier New", "Maple Mono NF CN (Subset)", monospace',
    );
    expect(getFontFamily('custom', '"Iosevka Term", "My Monospace Backup"')).toContain(
      '"Iosevka Term", "My Monospace Backup", ui-monospace',
    );
  });
});
