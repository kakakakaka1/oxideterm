import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { attachTerminalSmartCopy } from '@/hooks/useTerminalSmartCopy';

vi.mock('@/lib/platform', () => ({
  platform: {
    isWindows: true,
    isLinux: false,
    isMac: false,
  },
}));

type Handler = (event: KeyboardEvent) => boolean;

function createTerminalMock() {
  let handler: Handler | null = null;

  return {
    term: {
      attachCustomKeyEventHandler: vi.fn((nextHandler: Handler) => {
        handler = nextHandler;
      }),
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ''),
    } as unknown as Terminal,
    getHandler: () => handler,
  };
}

describe('attachTerminalSmartCopy', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('copies the current selection and consumes Ctrl+C when enabled', () => {
    const { term, getHandler } = createTerminalMock();
    const writeText = vi.mocked(navigator.clipboard.writeText);
    const hasSelection = vi.mocked(term.hasSelection);
    const getSelection = vi.mocked(term.getSelection);

    hasSelection.mockReturnValue(true);
    getSelection.mockReturnValue('selected output');

    attachTerminalSmartCopy(term, {
      isActive: () => true,
      isEnabled: () => true,
    });

    const handled = getHandler()?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(handled).toBe(false);
    expect(writeText).toHaveBeenCalledWith('selected output');
  });

  it('lets Ctrl+C pass through when nothing is selected', () => {
    const { term, getHandler } = createTerminalMock();
    const writeText = vi.mocked(navigator.clipboard.writeText);
    const hasSelection = vi.mocked(term.hasSelection);

    hasSelection.mockReturnValue(false);

    attachTerminalSmartCopy(term, {
      isActive: () => true,
      isEnabled: () => true,
    });

    const handled = getHandler()?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(handled).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('lets Ctrl+C pass through when smart copy is disabled', () => {
    const { term, getHandler } = createTerminalMock();
    const writeText = vi.mocked(navigator.clipboard.writeText);
    const hasSelection = vi.mocked(term.hasSelection);

    hasSelection.mockReturnValue(true);

    attachTerminalSmartCopy(term, {
      isActive: () => true,
      isEnabled: () => false,
    });

    const handled = getHandler()?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(handled).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('lets Ctrl+C pass through when the terminal is inactive', () => {
    const { term, getHandler } = createTerminalMock();
    const writeText = vi.mocked(navigator.clipboard.writeText);
    const hasSelection = vi.mocked(term.hasSelection);

    hasSelection.mockReturnValue(true);

    attachTerminalSmartCopy(term, {
      isActive: () => false,
      isEnabled: () => true,
    });

    const handled = getHandler()?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));

    expect(handled).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('restores the default pass-through handler on dispose', () => {
    const { term } = createTerminalMock();
    const attachCustomKeyEventHandler = vi.mocked(term.attachCustomKeyEventHandler);

    const disposable = attachTerminalSmartCopy(term, {
      isActive: () => true,
      isEnabled: () => true,
    });

    disposable.dispose();

    expect(attachCustomKeyEventHandler).toHaveBeenCalledTimes(2);
    const restoredHandler = attachCustomKeyEventHandler.mock.calls[1]?.[0] as Handler;
    expect(restoredHandler(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(true);
  });
});