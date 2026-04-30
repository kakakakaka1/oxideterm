// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseAnsiSgr } from '@/lib/terminal/ansiSgr';

describe('parseAnsiSgr', () => {
  it('returns plain text and one span for unstyled text', () => {
    const parsed = parseAnsiSgr('plain output');

    expect(parsed.plainText).toBe('plain output');
    expect(parsed.spans).toEqual([
      {
        text: 'plain output',
        start: 0,
        end: 12,
        style: {},
      },
    ]);
  });

  it('parses basic SGR styles without leaking escape sequences into plainText', () => {
    const parsed = parseAnsiSgr('a\x1b[31;1mred\x1b[0m z');

    expect(parsed.plainText).toBe('ared z');
    expect(parsed.spans).toHaveLength(3);
    expect(parsed.spans[1]).toMatchObject({
      text: 'red',
      start: 1,
      end: 4,
      style: {
        color: '#cd3131',
        fontWeight: 700,
      },
    });
  });

  it('supports truecolor, 256-color, underline, and ignores non-SGR CSI', () => {
    const parsed = parseAnsiSgr('\x1b[?25l\x1b[4;38;2;1;2;3mhi\x1b[48;5;196m!\x1b[0m');

    expect(parsed.plainText).toBe('hi!');
    expect(parsed.spans[0]).toMatchObject({
      text: 'hi',
      style: {
        color: 'rgb(1, 2, 3)',
        textDecoration: 'underline',
      },
    });
    expect(parsed.spans[1]).toMatchObject({
      text: '!',
      style: {
        color: 'rgb(1, 2, 3)',
        backgroundColor: 'rgb(255, 0, 0)',
        textDecoration: 'underline',
      },
    });
  });

  it('applies basic terminal text controls before exposing plainText', () => {
    expect(parseAnsiSgr('l\bls').plainText).toBe('ls');
    expect(parseAnsiSgr('\b\bls').plainText).toBe('ls');
    expect(parseAnsiSgr('old\rnew').plainText).toBe('new');
  });
});
