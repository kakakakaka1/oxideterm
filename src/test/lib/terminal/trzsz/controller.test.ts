import { describe, expect, it, vi } from 'vitest';

import {
  createUnavailableTrzszCapabilities,
  type TrzszCapabilitiesProbeResult,
} from '@/lib/terminal/trzsz/capabilities';
import { TrzszController } from '@/lib/terminal/trzsz/controller';
import type { RemoteTerminalTransport } from '@/lib/terminal/trzsz/transport';

function createTransportMock(): RemoteTerminalTransport {
  return {
    canSendInput: vi.fn(() => true),
    sendEncodedPayload: vi.fn(() => true),
    sendRawInput: vi.fn(() => true),
    sendTextInput: vi.fn(() => true),
    sendExecuteInput: vi.fn(() => true),
    sendBinaryInput: vi.fn(() => true),
    sendResize: vi.fn(() => true),
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
}

describe('TrzszController', () => {
  it('passes server output to the writer and forwards input while active', () => {
    const writeServerOutput = vi.fn();
    const transport = createTransportMock();
    const controller = new TrzszController({
      sessionId: 'session-1',
      connectionId: 'conn-1',
      wsUrl: 'ws://localhost:1234',
      ownerId: 'trzsz:session-1:conn-1:owner',
      transport,
      writeServerOutput,
      loadCapabilities: async () => createUnavailableTrzszCapabilities('command-missing'),
    });

    controller.processServerOutput(new Uint8Array([0x61, 0x62]));
    controller.processTerminalInput('ls');
    controller.processBinaryInput('\u001bOA');
    controller.sendTextInput('echo hello');
    controller.sendExecuteInput('pwd');
    controller.setTerminalColumns(132);

    expect(writeServerOutput).toHaveBeenCalledWith(new Uint8Array([0x61, 0x62]));
    expect(transport.sendRawInput).toHaveBeenCalledWith('ls');
    expect(transport.sendBinaryInput).toHaveBeenCalledWith('\u001bOA');
    expect(transport.sendTextInput).toHaveBeenCalledWith('echo hello');
    expect(transport.sendExecuteInput).toHaveBeenCalledWith('pwd');
    expect(controller.getTerminalColumns()).toBe(132);
    expect(controller.matchesRuntime('conn-1', 'ws://localhost:1234')).toBe(true);
  });

  it('stops processing IO once draining or disposed', () => {
    const writeServerOutput = vi.fn();
    const transport = createTransportMock();
    const controller = new TrzszController({
      sessionId: 'session-1',
      connectionId: 'conn-1',
      wsUrl: 'ws://localhost:1234',
      ownerId: 'trzsz:session-1:conn-1:owner',
      transport,
      writeServerOutput,
      loadCapabilities: async () => createUnavailableTrzszCapabilities('command-missing'),
    });

    controller.stop();
    expect(controller.isDraining()).toBe(true);
    expect(controller.processTerminalInput('pwd')).toBe(false);
    expect(controller.sendTextInput('echo blocked')).toBe(false);
    expect(controller.sendExecuteInput('blocked')).toBe(false);
    controller.processServerOutput(new Uint8Array([0x63]));

    controller.dispose();

    expect(controller.isDisposed()).toBe(true);
    expect(controller.processBinaryInput('\u001bOB')).toBe(false);
    expect(writeServerOutput).not.toHaveBeenCalled();
    expect(transport.sendRawInput).not.toHaveBeenCalled();
    expect(transport.sendBinaryInput).not.toHaveBeenCalled();
    expect(transport.sendTextInput).not.toHaveBeenCalled();
    expect(transport.sendExecuteInput).not.toHaveBeenCalled();
  });

  it('stores capability probe results without breaking passthrough mode', async () => {
    const writeServerOutput = vi.fn();
    const transport = createTransportMock();
    const available: TrzszCapabilitiesProbeResult = {
      status: 'available',
      capabilities: {
        apiVersion: 1,
        provider: 'trzsz',
        features: {
          directory: false,
          atomicDirectoryStage: false,
        },
      },
    };
    const controller = new TrzszController({
      sessionId: 'session-2',
      connectionId: 'conn-2',
      wsUrl: 'ws://localhost:4321',
      ownerId: 'trzsz:session-2:conn-2:owner',
      transport,
      writeServerOutput,
      loadCapabilities: async () => available,
    });

    await flushMicrotasks();

    expect(controller.getCapabilities()).toEqual(available);
    controller.processTerminalInput('echo ready');
    expect(transport.sendRawInput).toHaveBeenCalledWith('echo ready');
  });
});