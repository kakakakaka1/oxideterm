// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { AgentPlan, AgentReviewResult, AgentRoundContract, AgentStep } from '../../types';
import { parseRoundContractResponse } from './structuredOutput';

export function buildRoundContractSystemPrompt(): string {
  return `You are a contract builder for a long-running autonomous coding agent.

Your job is to convert a high-level task plan plus the most recent execution context into a narrow, testable round contract.

## Goals
1. Define exactly one primary objective for the next round.
2. State what is in scope and out of scope for this round.
3. List concrete actions the executor should attempt.
4. Define verification and exit criteria so completion can be reviewed.
5. Call out risk flags and expected approvals.

## Output Format
Return JSON only:

\`\`\`json
{
  "contract": {
    "objective": "One clear round objective",
    "scopeIn": ["..."] ,
    "scopeOut": ["..."],
    "plannedActions": ["..."],
    "expectedTools": ["..."],
    "verificationChecklist": ["..."],
    "exitCriteria": ["..."],
    "riskFlags": ["security" | "state-sync" | "destructive-write" | "external-side-effect"],
    "approvalPlan": {
      "expectedApprovalCount": 0,
      "requiresUserApprovalFor": ["..."]
    }
  }
}
\`\`\`

## Rules
- Keep the contract narrow enough for one round.
- Prefer explicit verification over vague confidence.
- If the previous review asked for correction, make that the main objective.
- Do not restate the full task plan.
- Do not emit prose outside JSON.`;
}

export function buildRoundContractPrompt(options: {
  taskId: string;
  goal: string;
  roundIndex: number;
  plan: AgentPlan | null;
  recentSteps: AgentStep[];
  lastReview: AgentReviewResult | null;
}): string {
  const { taskId, goal, roundIndex, plan, recentSteps, lastReview } = options;

  const currentPlanStep = plan?.steps[plan.currentStepIndex]?.description ?? null;
  const remainingPlan = plan?.steps
    .slice(plan.currentStepIndex)
    .map((step, index) => `${index + 1}. ${step.description}`)
    .join('\n') ?? 'No plan available';
  const recentSummary = recentSteps
    .slice(-8)
    .map((step) => `[R${step.roundIndex}/${step.type}] ${step.content.slice(0, 160)}`)
    .join('\n');

  return `Task ID: ${taskId}
Goal: ${goal}
Round: ${roundIndex + 1}

Current plan step: ${currentPlanStep ?? 'No explicit current plan step'}

Remaining plan:
${remainingPlan}

Recent execution trace:
${recentSummary || 'No recent steps'}

Last review:
${lastReview ? JSON.stringify(lastReview, null, 2) : 'None'}

Build the next round contract.`;
}

export function fallbackRoundContract(options: {
  taskId: string;
  roundIndex: number;
  goal: string;
  plan: AgentPlan | null;
  lastReview: AgentReviewResult | null;
}): AgentRoundContract {
  const { taskId, roundIndex, goal, plan, lastReview } = options;
  const currentPlanStep = plan?.steps[plan.currentStepIndex]?.description;
  const remainingSteps = plan?.steps.slice(plan.currentStepIndex + 1).map((step) => step.description) ?? [];
  const correctionObjective = lastReview?.assessment === 'needs_correction' || lastReview?.assessment === 'reset_required'
    ? lastReview.blockingFindings[0] || lastReview.summary
    : null;

  return {
    id: crypto.randomUUID(),
    taskId,
    roundIndex,
    objective: correctionObjective || currentPlanStep || goal,
    scopeIn: [currentPlanStep || goal],
    scopeOut: remainingSteps.slice(0, 3),
    plannedActions: [correctionObjective || currentPlanStep || `Make measurable progress on: ${goal}`],
    expectedTools: [],
    verificationChecklist: ['Record at least one concrete verification result before claiming completion.'],
    exitCriteria: ['The round objective is complete.', 'Verification evidence is recorded in the log.'],
    riskFlags: [],
    approvalPlan: {
      expectedApprovalCount: null,
      requiresUserApprovalFor: [],
    },
  };
}

export function parseRoundContract(text: string): AgentRoundContract | null {
  return parseRoundContractResponse(text);
}

export function formatRoundContractForExecutor(contract: AgentRoundContract): string {
  const lines = [
    `Round objective: ${contract.objective}`,
    contract.scopeIn.length > 0 ? `In scope: ${contract.scopeIn.join('; ')}` : '',
    contract.scopeOut.length > 0 ? `Out of scope: ${contract.scopeOut.join('; ')}` : '',
    contract.plannedActions.length > 0 ? `Planned actions: ${contract.plannedActions.join('; ')}` : '',
    contract.verificationChecklist.length > 0 ? `Verification checklist: ${contract.verificationChecklist.join('; ')}` : '',
    contract.exitCriteria.length > 0 ? `Exit criteria: ${contract.exitCriteria.join('; ')}` : '',
  ].filter(Boolean);

  return `[Round contract]\n${lines.join('\n')}`;
}