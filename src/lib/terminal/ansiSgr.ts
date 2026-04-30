// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties } from 'react';

export interface ParsedAnsiSpan {
  text: string;
  start: number;
  end: number;
  style: CSSProperties;
}

export interface ParsedAnsiLine {
  plainText: string;
  spans: ParsedAnsiSpan[];
}

const ANSI_COLORS = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5',
];

const ANSI_BRIGHT_COLORS = [
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#ffffff',
];

function cloneStyle(style: CSSProperties): CSSProperties {
  return { ...style };
}

function xterm256Color(index: number): string | undefined {
  if (!Number.isFinite(index) || index < 0 || index > 255) return undefined;
  if (index < 8) return ANSI_COLORS[index];
  if (index < 16) return ANSI_BRIGHT_COLORS[index - 8];
  if (index >= 232) {
    const value = 8 + (index - 232) * 10;
    return `rgb(${value}, ${value}, ${value})`;
  }

  const colorIndex = index - 16;
  const r = Math.floor(colorIndex / 36);
  const g = Math.floor((colorIndex % 36) / 6);
  const b = colorIndex % 6;
  const channel = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

function parseSgrParameters(raw: string): number[] {
  if (!raw) return [0];
  const parts = raw.replace(/:/g, ';').split(';');
  const codes = parts.map((part) => {
    if (part === '') return 0;
    const parsed = Number(part);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return codes.length > 0 ? codes : [0];
}

function applySgrCode(codes: number[], style: CSSProperties): CSSProperties {
  const next = cloneStyle(style);

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];

    if (code === 0) {
      Object.keys(next).forEach((key) => {
        delete (next as Record<string, unknown>)[key];
      });
    } else if (code === 1) {
      next.fontWeight = 700;
    } else if (code === 22) {
      delete next.fontWeight;
    } else if (code === 4) {
      next.textDecoration = 'underline';
    } else if (code === 24) {
      delete next.textDecoration;
    } else if (code === 39) {
      delete next.color;
    } else if (code === 49) {
      delete next.backgroundColor;
    } else if (code >= 30 && code <= 37) {
      next.color = ANSI_COLORS[code - 30];
    } else if (code >= 90 && code <= 97) {
      next.color = ANSI_BRIGHT_COLORS[code - 90];
    } else if (code >= 40 && code <= 47) {
      next.backgroundColor = ANSI_COLORS[code - 40];
    } else if (code >= 100 && code <= 107) {
      next.backgroundColor = ANSI_BRIGHT_COLORS[code - 100];
    } else if (code === 38 || code === 48) {
      const target = code === 38 ? 'color' : 'backgroundColor';
      const mode = codes[index + 1];

      if (mode === 2) {
        const r = codes[index + 2];
        const g = codes[index + 3];
        const b = codes[index + 4];
        if ([r, g, b].every((value) => Number.isFinite(value) && value >= 0 && value <= 255)) {
          next[target] = `rgb(${r}, ${g}, ${b})`;
        }
        index += 4;
      } else if (mode === 5) {
        const color = xterm256Color(codes[index + 2]);
        if (color) next[target] = color;
        index += 2;
      }
    }
  }

  return next;
}

function skipEscapeSequence(input: string, index: number): number {
  const next = input[index + 1];
  if (!next) return index + 1;

  if (next === '[') {
    let cursor = index + 2;
    while (cursor < input.length) {
      const code = input.charCodeAt(cursor);
      if (code >= 0x40 && code <= 0x7e) return cursor + 1;
      cursor += 1;
    }
    return input.length;
  }

  if (next === ']') {
    let cursor = index + 2;
    while (cursor < input.length) {
      if (input.charCodeAt(cursor) === 0x07) return cursor + 1;
      if (input[cursor] === '\x1b' && input[cursor + 1] === '\\') return cursor + 2;
      cursor += 1;
    }
    return input.length;
  }

  return index + 2;
}

export function parseAnsiSgr(input: string): ParsedAnsiLine {
  const spans: ParsedAnsiSpan[] = [];
  let plainText = '';
  let currentText = '';
  let currentStyle: CSSProperties = {};
  let currentStart = 0;

  const flush = () => {
    if (!currentText) return;
    const start = currentStart;
    const end = start + currentText.length;
    spans.push({
      text: currentText,
      start,
      end,
      style: cloneStyle(currentStyle),
    });
    currentText = '';
    currentStart = plainText.length;
  };

  const erasePreviousCharacter = () => {
    if (plainText.length === 0) return;
    plainText = plainText.slice(0, -1);

    if (currentText.length > 0) {
      currentText = currentText.slice(0, -1);
      return;
    }

    const lastSpan = spans[spans.length - 1];
    if (!lastSpan) return;
    lastSpan.text = lastSpan.text.slice(0, -1);
    lastSpan.end -= 1;
    if (lastSpan.text.length === 0) {
      spans.pop();
    }
    currentStart = plainText.length;
  };

  const resetVisibleLine = () => {
    spans.length = 0;
    plainText = '';
    currentText = '';
    currentStart = 0;
  };

  for (let index = 0; index < input.length;) {
    if (input[index] === '\b') {
      erasePreviousCharacter();
      index += 1;
      continue;
    }

    if (input[index] === '\r') {
      resetVisibleLine();
      index += 1;
      continue;
    }

    if (input[index] === '\x00' || input[index] === '\x07') {
      index += 1;
      continue;
    }

    if (input[index] !== '\x1b') {
      currentText += input[index];
      plainText += input[index];
      index += 1;
      continue;
    }

    if (input[index + 1] === '[') {
      let cursor = index + 2;
      while (cursor < input.length) {
        const code = input.charCodeAt(cursor);
        if (code >= 0x40 && code <= 0x7e) break;
        cursor += 1;
      }

      if (cursor < input.length && input[cursor] === 'm') {
        flush();
        currentStyle = applySgrCode(parseSgrParameters(input.slice(index + 2, cursor)), currentStyle);
        currentStart = plainText.length;
        index = cursor + 1;
        continue;
      }
    }

    index = skipEscapeSequence(input, index);
  }

  flush();

  return { plainText, spans };
}

export function parseTerminalLineText(text: string, ansiText?: string): ParsedAnsiLine {
  return parseAnsiSgr(ansiText ?? text);
}
