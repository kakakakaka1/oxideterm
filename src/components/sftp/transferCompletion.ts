// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { TransferState } from '../../store/transferStore';

export type TransferCompletionUpdate =
  | { state: 'completed' }
  | { state: 'error'; error: string }
  | null;

export function normalizeTransferFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveTransferCompletionUpdate(
  currentState: TransferState | undefined,
  success: boolean,
  error?: string,
): TransferCompletionUpdate {
  if (success) {
    return { state: 'completed' };
  }

  if (currentState === 'cancelled') {
    return null;
  }

  return {
    state: 'error',
    error: error || 'Transfer failed',
  };
}