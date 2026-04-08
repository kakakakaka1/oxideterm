// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

export const BRACKETED_PASTE_START = '\x1b[200~';
export const BRACKETED_PASTE_END = '\x1b[201~';

export function shouldUseBracketedPaste(content: string): boolean {
  return content.includes('\n');
}

export function formatTerminalTextInput(content: string): string {
  if (!shouldUseBracketedPaste(content)) {
    return content;
  }

  return `${BRACKETED_PASTE_START}${content}${BRACKETED_PASTE_END}`;
}

export function encodeTerminalTextInput(content: string): Uint8Array {
  return new TextEncoder().encode(formatTerminalTextInput(content));
}

export function encodeTerminalExecuteInput(content: string): Uint8Array {
  return new TextEncoder().encode(`${formatTerminalTextInput(content)}\n`);
}
