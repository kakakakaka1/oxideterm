// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { invoke } from '@tauri-apps/api/core';

import type { AiDiagnosticEvent, AiDiagnosticEventType } from './types';

export type AiDiagnosticSource = 'sidebar' | 'agent';

export type AiDiagnosticTelemetryBase = {
  source: AiDiagnosticSource;
  providerId?: string | null;
  model?: string | null;
  runId?: string | null;
  requestKind?: string | null;
  autonomyLevel?: string | null;
  budgetLevel?: 0 | 1 | 2 | 3 | 4;
  toolUseEnabled?: boolean;
};

export type CreateAiDiagnosticEventOptions = {
  conversationId: string;
  type: AiDiagnosticEventType;
  timestamp?: number;
  turnId?: string;
  roundId?: string;
  base?: AiDiagnosticTelemetryBase;
  data?: Record<string, unknown>;
};

type DiagnosticTailResponseDto = {
  events: AiDiagnosticEvent[];
};

function createDiagnosticId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDiagnosticData(
  base: AiDiagnosticTelemetryBase | undefined,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(base?.source ? { source: base.source } : null),
    ...(base?.providerId ? { providerId: base.providerId } : null),
    ...(base?.model ? { model: base.model } : null),
    ...(base?.runId ? { runId: base.runId } : null),
    ...(base?.requestKind ? { requestKind: base.requestKind } : null),
    ...(base?.autonomyLevel ? { autonomyLevel: base.autonomyLevel } : null),
    ...(base?.budgetLevel !== undefined ? { budgetLevel: base.budgetLevel } : null),
    ...(base?.toolUseEnabled !== undefined ? { toolUseEnabled: base.toolUseEnabled } : null),
    ...(data ?? {}),
  };
}

export function createAiDiagnosticEvent(options: CreateAiDiagnosticEventOptions): AiDiagnosticEvent {
  return {
    id: createDiagnosticId(),
    conversationId: options.conversationId,
    turnId: options.turnId,
    roundId: options.roundId,
    timestamp: options.timestamp ?? Date.now(),
    type: options.type,
    data: buildDiagnosticData(options.base, options.data),
  };
}

export async function persistDiagnosticEvents(
  conversationId: string,
  events: AiDiagnosticEvent[],
): Promise<void> {
  if (events.length === 0) return;

  await invoke('ai_chat_append_diagnostic_events', {
    request: {
      conversationId,
      events: events.map((event) => ({
        id: event.id,
        turnId: event.turnId ?? null,
        roundId: event.roundId ?? null,
        timestamp: event.timestamp,
        type: event.type,
        data: event.data,
      })),
    },
  });
}

export async function readDiagnosticTail(
  conversationId: string,
  count: number,
): Promise<AiDiagnosticEvent[]> {
  const response = await invoke<DiagnosticTailResponseDto>('ai_chat_get_diagnostic_tail', {
    conversationId,
    count,
  });

  return response.events;
}