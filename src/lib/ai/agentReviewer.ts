// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Agent Reviewer — Periodic self-review during agent execution.
 *
 * When enabled (settings.ai.agentRoles.reviewer), the reviewer is invoked
 * every N rounds to audit recent actions. It can use a different (potentially
 * stronger) model from the executor to catch errors, security issues, or
 * suggest course corrections.
 *
 * The review output is injected back into the executor's message history
 * so it can self-correct in subsequent rounds.
 */

import type { AgentReviewResult, AgentRoundContract, AgentStep } from '../../types';
import { parseReviewResponse } from './structuredOutput';

// DEFAULT_REVIEW_INTERVAL is now in agentConfig.ts — kept as re-export for compatibility
export { DEFAULT_REVIEW_INTERVAL } from './agentConfig';

/** Build the reviewer system prompt */
export function buildReviewerSystemPrompt(): string {
  return `You are a quality assurance reviewer for an autonomous terminal operations agent. Your job is to audit the agent's recent actions and provide actionable feedback.

## Your Responsibilities
1. **Contract adherence**: Did the agent stay within the round objective and stated scope?
2. **Correctness**: Did the actions actually achieve the intended result?
3. **Safety**: Any dangerous commands, state corruption risks, or side effects outside the contract?
4. **Efficiency**: Is the agent making progress or looping?
5. **Verification quality**: Did the agent gather concrete evidence before claiming completion?

## Output Format
Respond with concise JSON only:
\`\`\`json
{
  "review": {
    "assessment": "pass" | "needs_correction" | "reset_required" | "critical_failure",
    "summary": "Brief summary of the result",
    "blockingFindings": ["Finding 1", "Finding 2"],
    "suggestions": ["Suggestion 1", "Suggestion 2"],
    "scorecard": {
      "contractAdherence": { "score": 0-10, "passed": true, "findings": [] },
      "correctness": { "score": 0-10, "passed": true, "findings": [] },
      "safety": { "score": 0-10, "passed": true, "findings": [] },
      "efficiency": { "score": 0-10, "passed": true, "findings": [] },
      "verificationQuality": { "score": 0-10, "passed": true, "findings": [] }
    },
    "should_continue": true | false
  }
}
\`\`\`

## Rules
- Be concise — the executor has limited context window
- Focus on actionable feedback, not praise
- Safety failure should produce "critical_failure"
- Repeated failures that need a clean slate should produce "reset_required"
- A task cannot pass if verificationQuality or correctness did not pass
- If everything looks good, use assessment "pass"`;
}

/** Build the review prompt with recent execution context */
export function buildReviewPrompt(
  goal: string,
  contract: AgentRoundContract | null,
  recentSteps: AgentStep[],
  currentRound: number,
  maxRounds: number,
): string {
  const stepsSummary = recentSteps.map((s) => {
    const prefix = `[R${s.roundIndex}/${s.type}]`;
    if (s.type === 'tool_call' && s.toolCall) {
      const result = s.toolCall.result;
      const status = result ? (result.success ? 'OK' : 'FAIL') : 'PENDING';
      return `${prefix} ${s.toolCall.name}(${s.toolCall.arguments.slice(0, 100)}) → ${status}`;
    }
    return `${prefix} ${s.content.slice(0, 150)}`;
  }).join('\n');

  return `## Task Goal
${goal}

## Progress
Round ${currentRound} / ${maxRounds}

## Round Contract
${contract ? JSON.stringify(contract, null, 2) : 'No contract available'}

## Recent Actions (last ${recentSteps.length} steps)
${stepsSummary}

Please review these actions and provide your assessment.`;
}

/** Parse the reviewer's response into a structured review */
export function parseReview(text: string): AgentReviewResult | null {
  return parseReviewResponse(text);
}

export function shouldRunReviewerForRound(round: number, reviewInterval: number): boolean {
  return reviewInterval > 0 && ((round + 1) % reviewInterval === 0);
}

export function formatReviewFeedback(
  review: AgentReviewResult,
  round: number,
): string | null {
  if (review.assessment === 'pass') return null;

  const lines = [`[Review feedback after round ${round + 1}]: ${review.summary || 'Reviewer requested course correction.'}`];
  if (review.blockingFindings.length > 0) {
    lines.push(`Blocking findings: ${review.blockingFindings.join('; ')}`);
  }
  if (review.suggestions.length > 0) {
    lines.push(`Suggestions: ${review.suggestions.join('; ')}`);
  }
  return lines.join('\n');
}
