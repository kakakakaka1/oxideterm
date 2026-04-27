// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { AiToolResult } from '../../../types';
import type { ToolCapability, ToolResultEnvelope } from '../tools/protocol';
import { createToolResultEnvelope } from '../tools/protocol';
import type { AiActionResult, AiActionRisk, AiTarget } from './types';

const MODEL_OUTPUT_MAX_CHARS = 12000;

function riskToCapability(risk: AiActionRisk): ToolCapability | undefined {
  switch (risk) {
    case 'read':
      return 'state.list';
    case 'write':
      return 'filesystem.write';
    case 'execute':
      return 'command.run';
    case 'interactive':
      return 'terminal.send';
    default:
      return undefined;
  }
}

function truncate(value: string, maxChars = MODEL_OUTPUT_MAX_CHARS): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return {
    value: `${value.slice(0, maxChars)}\n\n[truncated: ${value.length - maxChars} chars omitted]`,
    truncated: true,
  };
}

function mapTarget(target: AiTarget): NonNullable<ToolResultEnvelope['targets']>[number] {
  return {
    id: target.id,
    kind: target.kind,
    label: target.label,
    metadata: {
      state: target.state,
      capabilities: target.capabilities,
      refs: target.refs,
      ...(target.metadata ?? {}),
    },
  };
}

export function actionResultToToolResult(
  toolCallId: string,
  toolName: string,
  result: AiActionResult,
  durationMs: number,
): AiToolResult {
  const rawOutput = result.output ?? result.summary;
  const output = truncate(rawOutput);
  const targets = [
    ...(result.target ? [result.target] : []),
    ...(result.targets ?? []),
  ];
  const envelope = createToolResultEnvelope({
    ok: result.ok,
    toolName,
    summary: result.summary,
    output: output.value,
    data: result.data,
    error: result.error,
    recoverable: result.error?.recoverable,
    waitingForInput: result.waitingForInput,
    capability: riskToCapability(result.risk),
    targetId: result.target?.id,
    targets: targets.map(mapTarget),
    nextActions: result.nextActions?.map((next) => ({
      tool: next.action,
      args: next.args,
      reason: next.reason,
      priority: 'recommended' as const,
    })),
    durationMs,
    truncated: output.truncated,
  });

  return {
    toolCallId,
    toolName,
    success: result.ok,
    output: output.value,
    ...(result.error ? { error: result.error.message } : {}),
    durationMs,
    truncated: output.truncated,
    envelope,
  };
}

export function failAction(
  summary: string,
  code: string,
  message: string,
  risk: AiActionRisk = 'read',
  options: Partial<AiActionResult> = {},
): AiActionResult {
  return {
    ok: false,
    summary,
    output: message,
    risk,
    ...options,
    error: {
      code,
      message,
      recoverable: true,
      ...(options.error ?? {}),
    },
  };
}

