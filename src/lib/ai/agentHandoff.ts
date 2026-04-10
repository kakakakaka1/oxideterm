// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { AgentHandoffArtifact, AgentTask } from '../../types';

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function collectRelevantFiles(task: AgentTask): string[] {
  const files = new Set<string>();

  for (const step of task.steps) {
    if (!step.toolCall) continue;
    const args = safeParseJson(step.toolCall.arguments);
    if (!args) continue;

    for (const key of ['path', 'filePath', 'targetPath', 'oldPath', 'newPath']) {
      const value = args[key];
      if (typeof value === 'string' && value.trim()) {
        files.add(value.trim());
      }
    }
  }

  return [...files].slice(-10);
}

function collectRelevantCommands(task: AgentTask): string[] {
  const commands = new Set<string>();

  for (const step of task.steps) {
    if (step.toolCall?.name !== 'terminal_exec') continue;
    const args = safeParseJson(step.toolCall.arguments);
    const command = typeof args?.command === 'string' ? args.command.trim() : '';
    if (command) commands.add(command);
  }

  return [...commands].slice(-10);
}

export function buildHandoffArtifact(options: {
  task: AgentTask;
  reason: string;
}): AgentHandoffArtifact {
  const { task, reason } = options;
  const currentPlanStep = task.plan?.steps[task.plan.currentStepIndex]?.description ?? null;
  const completedWork = task.plan?.steps
    .filter((step) => step.status === 'completed')
    .map((step) => step.description)
    ?? [];
  const remainingWork = task.plan?.steps
    .filter((step, index) => step.status !== 'completed' && index >= (task.plan?.currentStepIndex ?? 0))
    .map((step) => step.description)
    ?? [];
  const repeatedFailures = task.lastReview?.blockingFindings ?? [];
  const knownRisks = [
    ...(task.activeContract?.riskFlags ?? []),
    ...repeatedFailures,
  ];

  return {
    id: crypto.randomUUID(),
    lineageId: task.lineageId,
    sourceTaskId: task.id,
    sourceRound: task.currentRound,
    targetGoal: task.goal,
    summary: reason,
    completedWork,
    remainingWork,
    knownRisks: [...new Set(knownRisks)].slice(0, 10),
    repeatedFailures,
    nextBestActions: [
      ...(task.lastReview?.suggestions ?? []),
      ...(currentPlanStep ? [`Resume from plan step: ${currentPlanStep}`] : []),
    ].slice(0, 10),
    preservedContext: {
      planDescription: task.plan?.description ?? null,
      currentPlanStepIndex: task.plan?.currentStepIndex ?? null,
      relevantFiles: collectRelevantFiles(task),
      relevantCommands: collectRelevantCommands(task),
    },
    contractSnapshot: task.activeContract,
    reviewerSnapshot: task.lastReview,
    createdAt: Date.now(),
  };
}

export function formatHandoffForExecutor(artifact: AgentHandoffArtifact): string {
  const sections = [
    `Summary: ${artifact.summary}`,
    artifact.completedWork.length > 0 ? `Completed work: ${artifact.completedWork.join('; ')}` : '',
    artifact.remainingWork.length > 0 ? `Remaining work: ${artifact.remainingWork.join('; ')}` : '',
    artifact.knownRisks.length > 0 ? `Known risks: ${artifact.knownRisks.join('; ')}` : '',
    artifact.nextBestActions.length > 0 ? `Next best actions: ${artifact.nextBestActions.join('; ')}` : '',
  ].filter(Boolean);

  return `[Task handoff]\n${sections.join('\n')}`;
}