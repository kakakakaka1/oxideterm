// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

export interface SyntheticToolDenyPayload {
  kind: 'tool_denied';
  reason: string;
  detail?: string;
}

export function createSyntheticToolDenyPayload(reason: string, detail?: string): SyntheticToolDenyPayload {
  return {
    kind: 'tool_denied',
    reason,
    detail,
  };
}