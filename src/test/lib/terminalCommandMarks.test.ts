// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  cleanupTerminalCommandMarks,
  createTerminalCommandMark,
  listTerminalCommandMarks,
} from '@/lib/terminal/commandMarks';

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        terminal: {
          commandMarks: {
            enabled: true,
            userInputObserved: false,
            heuristicDetection: false,
            showHoverActions: true,
          },
        },
      },
      setAiSidebarCollapsed: vi.fn(),
    }),
  },
}));

vi.mock('@/store/aiChatStore', () => ({
  useAiChatStore: {
    getState: () => ({
      sendMessage: vi.fn(),
    }),
  },
}));

vi.mock('@/lib/ai/orchestrator/ledger', () => ({
  addAiCommandRecord: vi.fn(),
}));

vi.mock('@/lib/ai/orchestrator/runtimeEpoch', () => ({
  getAiRuntimeEpoch: () => 'test-runtime',
}));

type MockMarker = {
  dispose: ReturnType<typeof vi.fn>;
  onDispose: ReturnType<typeof vi.fn>;
};

type MockDecoration = {
  dispose: ReturnType<typeof vi.fn>;
  onRender: ReturnType<typeof vi.fn>;
};

function createMockTerminal(options: {
  marker?: MockMarker | null;
  decoration?: MockDecoration | null;
} = {}): Terminal {
  const marker = options.marker === undefined
    ? { dispose: vi.fn(), onDispose: vi.fn() }
    : options.marker;
  const decoration = options.decoration === undefined
    ? { dispose: vi.fn(), onRender: vi.fn() }
    : options.decoration;

  return {
    cols: 120,
    buffer: {
      active: {
        type: 'normal',
        baseY: 10,
        cursorY: 2,
        length: 40,
        getLine: vi.fn(() => ({ translateToString: () => 'output' })),
      },
    },
    modes: { mouseTrackingMode: 'none' },
    registerMarker: vi.fn(() => marker),
    registerDecoration: vi.fn(() => decoration),
  } as unknown as Terminal;
}

describe('terminal command marks', () => {
  beforeEach(() => {
    cleanupTerminalCommandMarks('pane-1');
  });

  it('does not mutate the store when decoration registration fails', () => {
    const marker = { dispose: vi.fn(), onDispose: vi.fn() };
    const term = createMockTerminal({ marker, decoration: null });

    const mark = createTerminalCommandMark(term, 'pane-1', {
      command: 'ls -la',
      source: 'command_bar',
      sessionId: 'session-1',
    });

    expect(mark).toBeNull();
    expect(marker.dispose).toHaveBeenCalledTimes(1);
    expect(listTerminalCommandMarks('pane-1')).toEqual([]);
  });

  it('commits a mark only after marker and decoration are registered', () => {
    const decoration = { dispose: vi.fn(), onRender: vi.fn() };
    const term = createMockTerminal({ decoration });

    const mark = createTerminalCommandMark(term, 'pane-1', {
      command: 'pwd',
      source: 'command_bar',
      sessionId: 'session-1',
      cwd: '/tmp',
    });

    expect(mark?.command).toBe('pwd');
    expect(decoration.onRender).toHaveBeenCalledTimes(1);
    expect(listTerminalCommandMarks('pane-1')).toMatchObject([
      {
        command: 'pwd',
        cwd: '/tmp',
        startLine: 12,
        isClosed: false,
        detectionSource: 'command_bar',
        confidence: 'high',
      },
    ]);
  });

  it('keeps experimental heuristic marks disabled by default', () => {
    const term = createMockTerminal();

    const mark = createTerminalCommandMark(term, 'pane-1', {
      command: 'echo maybe',
      source: 'heuristic',
      sessionId: 'session-1',
    });

    expect(mark).toBeNull();
    expect(listTerminalCommandMarks('pane-1')).toEqual([]);
  });
});
