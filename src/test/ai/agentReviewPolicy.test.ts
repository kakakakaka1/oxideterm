import { describe, expect, it } from 'vitest';

import { finalizeReviewResult, shouldTriggerContextReset } from '@/lib/ai/agentReviewPolicy';
import type { AgentReviewResult } from '@/types';

function makeReview(assessment: AgentReviewResult['assessment'], failedCategories: Array<'contractAdherence' | 'correctness' | 'safety' | 'efficiency' | 'verificationQuality'>): AgentReviewResult {
  const base = {
    contractAdherence: { score: 8, passed: true, findings: [] as string[] },
    correctness: { score: 8, passed: true, findings: [] as string[] },
    safety: { score: 8, passed: true, findings: [] as string[] },
    efficiency: { score: 8, passed: true, findings: [] as string[] },
    verificationQuality: { score: 8, passed: true, findings: [] as string[] },
  };

  for (const category of failedCategories) {
    base[category] = { score: 3, passed: false, findings: [`${category} failed`] };
  }

  return {
    assessment,
    summary: `${assessment} summary`,
    blockingFindings: failedCategories.map((category) => `${category} failed`),
    suggestions: ['Try again'],
    scorecard: base,
    shouldContinue: assessment !== 'critical_failure',
  };
}

describe('agentReviewPolicy', () => {
  it('escalates repeated failures to reset_required', () => {
    const previous = makeReview('needs_correction', ['contractAdherence', 'verificationQuality']);
    const current = makeReview('needs_correction', ['contractAdherence', 'verificationQuality']);

    expect(finalizeReviewResult(current, previous).assessment).toBe('reset_required');
  });

  it('does not escalate if the failure categories changed', () => {
    const previous = makeReview('needs_correction', ['contractAdherence']);
    const current = makeReview('needs_correction', ['correctness']);

    expect(finalizeReviewResult(current, previous).assessment).toBe('needs_correction');
  });

  it('triggers context reset near the configured threshold', () => {
    expect(shouldTriggerContextReset(8100, 10000)).toBe(true);
    expect(shouldTriggerContextReset(7900, 10000)).toBe(false);
  });
});