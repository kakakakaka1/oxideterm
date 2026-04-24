// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Shared font-family resolution for xterm.js terminal instances.
 *
 * Maps preset font names to full CSS font stacks with Latin Extended and CJK
 * fallbacks.
 * Used by TerminalView, LocalTerminalView, and CastPlayer.
 *
 * 🎯 Fallback 策略:
 *    ASCII / Nerd Font glyphs → 用户选择的字体
 *    Latin Extended / Vietnamese → system monospace fallbacks
 *    中日韩字符 → Maple Mono NF CN
 */

/** Monospace fallbacks with broad Latin Extended / Vietnamese coverage */
const LATIN_EXTENDED_FALLBACK =
  'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", "Courier New"';

/** CJK fallback font for Chinese/Japanese/Korean character support */
const CJK_FALLBACK = '"Maple Mono NF CN (Subset)"';

const TERMINAL_FALLBACK = `${LATIN_EXTENDED_FALLBACK}, ${CJK_FALLBACK}, monospace`;

function appendTerminalFallbacks(fontStack: string): string {
  const stack = fontStack.trim();
  if (/monospace\s*$/i.test(stack)) {
    return stack.replace(/,?\s*monospace\s*$/i, `, ${TERMINAL_FALLBACK}`);
  }
  return `${stack}, ${TERMINAL_FALLBACK}`;
}

/**
 * Resolve a preset font name (or custom value) into a full CSS font-family stack.
 *
 * @param fontFamily   Preset key: 'jetbrains' | 'meslo' | 'maple' | 'cascadia' | 'consolas' | 'menlo' | 'custom'
 * @param customFontFamily  User-specified font stack when `fontFamily === 'custom'`
 * @returns A CSS font-family string ready for xterm.js
 */
export function getFontFamily(fontFamily: string, customFontFamily?: string): string {
  // 自定义轨道: 用户输入优先，补齐 Latin Extended 与 CJK fallback。
  if (fontFamily === 'custom' && customFontFamily?.trim()) {
    return appendTerminalFallbacks(customFontFamily);
  }

  // 预设轨道: 拉丁字符用选定字体，Latin Extended 与 CJK 字符走 fallback。
  switch (fontFamily) {
    case 'jetbrains':
      return appendTerminalFallbacks(
        '"JetBrainsMono Nerd Font", "JetBrainsMono Nerd Font Mono", "JetBrains Mono NF (Subset)", "JetBrains Mono"',
      );
    case 'meslo':
      return appendTerminalFallbacks('"MesloLGM Nerd Font", "MesloLGM Nerd Font Mono", "MesloLGM NF (Subset)", "Meslo LG M"');
    case 'maple':
      return appendTerminalFallbacks('"Maple Mono NF CN (Subset)", "Maple Mono NF", "Maple Mono"');
    case 'cascadia':
      return appendTerminalFallbacks('"Cascadia Code NF", "Cascadia Mono NF", "Cascadia Code", "Cascadia Mono"');
    case 'consolas':
      return appendTerminalFallbacks('Consolas, "Courier New"');
    case 'menlo':
      return appendTerminalFallbacks('Menlo, Monaco, "Courier New"');
    default:
      return appendTerminalFallbacks(
        '"JetBrainsMono Nerd Font", "JetBrainsMono Nerd Font Mono", "JetBrains Mono NF (Subset)", "JetBrains Mono"',
      );
  }
}
