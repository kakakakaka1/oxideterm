// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { AgentReviewCategory, AgentReviewResult } from '../../types';

const REVIEW_CATEGORIES: AgentReviewCategory[] = [
  'contractAdherence',
  'correctness',
  'safety',
  'efficiency',
  'verificationQuality',
];

export function getFailedReviewCategories(review: AgentReviewResult): AgentReviewCategory[] {
  return REVIEW_CATEGORIES.filter((category) => !review.scorecard[category].passed);
}

export function shouldEscalateReviewToReset(
  current: AgentReviewResult,
  previous: AgentReviewResult | null,
): boolean {
  if (!previous) return false;
  if (current.assessment === 'critical_failure' || previous.assessment === 'critical_failure') {
    return false;
  }
  if (current.assessment === 'pass' || previous.assessment === 'pass') {
    return false;
  }

  const currentFailed = getFailedReviewCategories(current);
  const previousFailed = getFailedReviewCategories(previous);
  if (currentFailed.length === 0 || previousFailed.length === 0) {
    return false;
  }

  return currentFailed.every((category) => previousFailed.includes(category));
}

export function finalizeReviewResult(
  current: AgentReviewResult,
  previous: AgentReviewResult | null,
): AgentReviewResult {
  if (current.assessment === 'critical_failure') {
    return { ...current, shouldContinue: false };
  }
  if (current.assessment === 'reset_required') {
    return { ...current, shouldContinue: true };
  }
  if (shouldEscalateReviewToReset(current, previous)) {
    return {
      ...current,
      assessment: 'reset_required',
      summary: current.summary || previous?.summary || 'Reviewer requested a context reset after repeated failures.',
      blockingFindings: current.blockingFindings.length > 0
        ? current.blockingFindings
        : previous?.blockingFindings ?? [],
      shouldContinue: true,
    };
  }
  return current;
}

export function shouldTriggerContextReset(currentTokens: number, contextWindow: number, ratio = 0.8): boolean {
  if (contextWindow <= 0) return false;
  return currentTokens >= contextWindow * ratio;
}