import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { findCursorControlBoundary, useAdaptiveRenderer } from '@/hooks/useAdaptiveRenderer';

function textEncoder(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function createRendererHarness() {
  const writes: string[] = [];
  const terminal = {
    write: vi.fn((data: Uint8Array, callback?: () => void) => {
      writes.push(new TextDecoder().decode(data));
      callback?.();
    }),
  };

  let rafCallback: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    rafCallback = cb;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  const terminalRef = { current: terminal as never };
  const hook = renderHook(() => useAdaptiveRenderer({ terminalRef, mode: 'auto' }));

  return {
    writes,
    scheduleWrite: hook.result.current.scheduleWrite,
    flushRaf: () => rafCallback?.(16.7),
    hasPendingRaf: () => rafCallback !== null,
  };
}

describe('findCursorControlBoundary', () => {
  it('detects destructive CSI sequences at the start of a chunk', () => {
    expect(findCursorControlBoundary(textEncoder('\x1b[2Kprompt'))).toBe(0);
  });

  it('detects destructive CSI sequences after printable output', () => {
    expect(findCursorControlBoundary(textEncoder('file1\r\nfile2\r\n\x1b[2A\x1b[2K'))).toBe(14);
  });

  it('skips non-destructive CSI sequences and finds a later destructive one', () => {
    expect(findCursorControlBoundary(textEncoder('\x1b[31mred\x1b[0mfile\r\n\x1b[2Kprompt'))).toBe(18);
  });

  it('ignores non-destructive CSI sequences such as SGR color changes', () => {
    expect(findCursorControlBoundary(textEncoder('\x1b[31mred\x1b[0m'))).toBe(-1);
  });
});

describe('useAdaptiveRenderer', () => {
  it('flushes printable output before a later destructive cursor-control tail', () => {
    const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

    scheduleWrite(textEncoder('file1\r\nfile2\r\n\x1b[2A\x1b[2Kprompt$ '));

    expect(writes).toEqual(['file1\r\nfile2\r\n']);
    expect(hasPendingRaf()).toBe(true);

    flushRaf();

    expect(writes).toEqual([
      'file1\r\nfile2\r\n',
      '\x1b[2A\x1b[2Kprompt$ ',
    ]);
  });

  it('keeps inline redraw sequences in a single write when there is no prior line output', () => {
    const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

    scheduleWrite(textEncoder('hello\x1b[1Gworld'));

    expect(writes).toEqual([]);
    expect(hasPendingRaf()).toBe(true);

    flushRaf();

    expect(writes).toEqual(['hello\x1b[1Gworld']);
  });

  it('keeps carriage-return-based single-line redraw in a single write', () => {
    const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

    scheduleWrite(textEncoder('42%\r\x1b[2K43%'));

    expect(writes).toEqual([]);
    expect(hasPendingRaf()).toBe(true);

    flushRaf();

    expect(writes).toEqual(['42%\r\x1b[2K43%']);
  });

  it('flushes a pending single-line chunk before a later redraw chunk arrives', () => {
    const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

    scheduleWrite(textEncoder('hello'));
    scheduleWrite(textEncoder('\x1b[1Gworld'));

    expect(writes).toEqual(['hello']);
    expect(hasPendingRaf()).toBe(true);

    flushRaf();

    expect(writes).toEqual(['hello', '\x1b[1Gworld']);
  });

  describe('Issue #26 async prompt redraw regression', () => {
    it('preserves colored multiline output before same-chunk prompt redraw', () => {
      const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

      scheduleWrite(textEncoder('\x1b[32mfile1\x1b[0m\r\n\x1b[36mfile2\x1b[0m\r\n\x1b[2A\x1b[2Kprompt$ '));

      expect(writes).toEqual(['\x1b[32mfile1\x1b[0m\r\n\x1b[36mfile2\x1b[0m\r\n']);
      expect(hasPendingRaf()).toBe(true);

      flushRaf();

      expect(writes).toEqual([
        '\x1b[32mfile1\x1b[0m\r\n\x1b[36mfile2\x1b[0m\r\n',
        '\x1b[2A\x1b[2Kprompt$ ',
      ]);
    });

    it('preserves multiline output when the redraw CSI is split across network chunks', () => {
      const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

      scheduleWrite(textEncoder('file1\r\nfile2\r\n\x1b['));

      expect(writes).toEqual([]);
      expect(hasPendingRaf()).toBe(true);

      scheduleWrite(textEncoder('2A\x1b[2Kprompt$ '));

      expect(writes).toEqual(['file1\r\nfile2\r\n']);
      expect(hasPendingRaf()).toBe(true);

      flushRaf();

      expect(writes).toEqual([
        'file1\r\nfile2\r\n',
        '\x1b[2A\x1b[2Kprompt$ ',
      ]);
    });

    it('flushes a pending multiline chunk immediately when the next chunk starts with prompt redraw', () => {
      const { writes, scheduleWrite, flushRaf, hasPendingRaf } = createRendererHarness();

      scheduleWrite(textEncoder('file1\r\nfile2\r\n'));

      expect(writes).toEqual([]);
      expect(hasPendingRaf()).toBe(true);

      scheduleWrite(textEncoder('\x1b[2A\x1b[2Kprompt$ '));

      expect(writes).toEqual(['file1\r\nfile2\r\n']);
      expect(hasPendingRaf()).toBe(true);

      flushRaf();

      expect(writes).toEqual([
        'file1\r\nfile2\r\n',
        '\x1b[2A\x1b[2Kprompt$ ',
      ]);
    });

  });
});