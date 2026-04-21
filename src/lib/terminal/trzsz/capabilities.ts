export type TrzszCapabilitiesDto = {
  apiVersion: number;
  provider: 'trzsz';
  features: {
    directory: boolean;
    atomicDirectoryStage: boolean;
  };
};

export type TrzszCapabilitiesUnavailableReason =
  | 'mock'
  | 'no-tauri'
  | 'command-missing'
  | 'invoke-failed';

export type TrzszCapabilitiesProbeResult =
  | {
      status: 'available';
      capabilities: TrzszCapabilitiesDto;
    }
  | {
      status: 'unavailable';
      reason: TrzszCapabilitiesUnavailableReason;
      errorMessage?: string;
    };

export function createUnavailableTrzszCapabilities(
  reason: TrzszCapabilitiesUnavailableReason,
  errorMessage?: string,
): TrzszCapabilitiesProbeResult {
  return {
    status: 'unavailable',
    reason,
    errorMessage,
  };
}

export function isTrzszCapabilitiesAvailable(
  result: TrzszCapabilitiesProbeResult,
): result is Extract<TrzszCapabilitiesProbeResult, { status: 'available' }> {
  return result.status === 'available';
}