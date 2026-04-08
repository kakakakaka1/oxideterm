// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/** 行数阈值：超过此行数才触发确认 */
export const PASTE_LINE_THRESHOLD = 1;
/** 字符阈值：超过此长度才触发确认（配合行数使用） */
export const PASTE_CHAR_THRESHOLD = 50;

export type ProtectedPasteDecision = 'block' | 'confirm' | 'passthrough';

/**
 * 检查是否需要粘贴确认
 * @param content 粘贴内容
 * @returns 是否需要确认
 */
export function shouldConfirmPaste(content: string): boolean {
  const hasNewline = content.includes('\n');
  const lineCount = content.split('\n').length;

  return hasNewline && (lineCount > PASTE_LINE_THRESHOLD || content.length > PASTE_CHAR_THRESHOLD);
}

/**
 * 统一保护粘贴的状态判定。
 * - 非交互态时应阻断粘贴事件，避免底层终端继续消费输入。
 * - 交互态下，多行内容进入确认链路，其余交给 xterm 正常处理。
 */
export function getProtectedPasteDecision(
  content: string | null | undefined,
  isInteractive: boolean,
): ProtectedPasteDecision {
  if (!content) {
    return 'passthrough';
  }

  if (!isInteractive) {
    return 'block';
  }

  return shouldConfirmPaste(content) ? 'confirm' : 'passthrough';
}