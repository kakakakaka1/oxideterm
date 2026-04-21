import { describe, expect, it, vi } from 'vitest';

import { TrzszFilter } from '@/lib/terminal/trzsz/upstream/filter';

describe('TrzszFilter', () => {
  it('keeps normal terminal IO working after stopTransferringFiles without an active transfer', () => {
    const sendToServer = vi.fn();
    const filter = new TrzszFilter({
      writeToTerminal: vi.fn(),
      sendToServer,
      chooseSendFiles: vi.fn(async () => undefined),
      buildFileReaders: vi.fn(async () => undefined),
      chooseSaveDirectory: vi.fn(async () => undefined),
      openSaveFile: vi.fn(),
      terminalColumns: 80,
      isWindowsShell: false,
      maxDataChunkSize: 1024,
    });

    filter.stopTransferringFiles();
    filter.processTerminalInput('echo ready');
    filter.processBinaryInput('\u001bOA');

    expect(sendToServer).toHaveBeenNthCalledWith(1, 'echo ready');
    expect(sendToServer).toHaveBeenNthCalledWith(2, new Uint8Array([0x1b, 0x4f, 0x41]));
  });
});