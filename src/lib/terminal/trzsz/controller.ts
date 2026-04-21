import {
  createUnavailableTrzszCapabilities,
  type TrzszCapabilitiesProbeResult,
} from '@/lib/terminal/trzsz/capabilities';
import type { RemoteTerminalTransport } from '@/lib/terminal/trzsz/transport';

type TrzszControllerState = 'active' | 'draining' | 'disposed';

export type TrzszControllerParams = {
  sessionId: string;
  connectionId: string;
  wsUrl: string;
  ownerId: string;
  transport: RemoteTerminalTransport;
  writeServerOutput: (output: Uint8Array) => void;
  loadCapabilities: () => Promise<TrzszCapabilitiesProbeResult>;
};

function toUint8Array(output: Uint8Array | ArrayBuffer): Uint8Array {
  return output instanceof Uint8Array ? output : new Uint8Array(output);
}

export class TrzszController {
  private state: TrzszControllerState = 'active';
  private terminalColumns: number | null = null;
  private capabilityRequestVersion = 0;
  private capabilities: TrzszCapabilitiesProbeResult = createUnavailableTrzszCapabilities('invoke-failed');

  readonly sessionId: string;
  readonly connectionId: string;
  readonly wsUrl: string;
  readonly ownerId: string;

  constructor(private readonly params: TrzszControllerParams) {
    this.sessionId = params.sessionId;
    this.connectionId = params.connectionId;
    this.wsUrl = params.wsUrl;
    this.ownerId = params.ownerId;
    void this.refreshCapabilities();
  }

  private canProcessIo(): boolean {
    return this.state === 'active';
  }

  private async refreshCapabilities(): Promise<void> {
    const requestVersion = ++this.capabilityRequestVersion;

    try {
      const result = await this.params.loadCapabilities();
      if (this.state === 'disposed' || requestVersion !== this.capabilityRequestVersion) {
        return;
      }
      this.capabilities = result;
    } catch (error) {
      if (this.state === 'disposed' || requestVersion !== this.capabilityRequestVersion) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.capabilities = createUnavailableTrzszCapabilities('invoke-failed', errorMessage);
    }
  }

  matchesRuntime(connectionId: string, wsUrl: string): boolean {
    return this.connectionId === connectionId && this.wsUrl === wsUrl;
  }

  processServerOutput(output: Uint8Array | ArrayBuffer): void {
    if (!this.canProcessIo()) {
      return;
    }

    this.params.writeServerOutput(toUint8Array(output));
  }

  processTerminalInput(input: string): boolean {
    if (!this.canProcessIo()) {
      return false;
    }

    return this.params.transport.sendRawInput(input);
  }

  processBinaryInput(input: string): boolean {
    if (!this.canProcessIo()) {
      return false;
    }

    return this.params.transport.sendBinaryInput(input);
  }

  sendTextInput(input: string): boolean {
    if (!this.canProcessIo()) {
      return false;
    }

    return this.params.transport.sendTextInput(input);
  }

  sendExecuteInput(input: string): boolean {
    if (!this.canProcessIo()) {
      return false;
    }

    return this.params.transport.sendExecuteInput(input);
  }

  setTerminalColumns(cols: number): void {
    if (!Number.isFinite(cols) || cols <= 0) {
      return;
    }

    this.terminalColumns = Math.floor(cols);
  }

  getTerminalColumns(): number | null {
    return this.terminalColumns;
  }

  getCapabilities(): TrzszCapabilitiesProbeResult {
    return this.capabilities;
  }

  isDraining(): boolean {
    return this.state === 'draining';
  }

  isDisposed(): boolean {
    return this.state === 'disposed';
  }

  stop(): void {
    if (this.state === 'disposed') {
      return;
    }

    this.state = 'draining';
  }

  dispose(): void {
    if (this.state === 'disposed') {
      return;
    }

    this.state = 'disposed';
    this.capabilityRequestVersion += 1;
  }
}