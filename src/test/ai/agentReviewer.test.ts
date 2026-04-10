import { describe, expect, it } from 'vitest';

import { formatReviewFeedback, shouldRunReviewerForRound } from '@/lib/ai/agentReviewer';

describe('agentReviewer helpers', () => {
  it('runs reviewer on the first round when interval is 1', () => {
    expect(shouldRunReviewerForRound(0, 1)).toBe(true);
    expect(shouldRunReviewerForRound(1, 1)).toBe(true);
  });

  it('runs reviewer on matching intervals only', () => {
    expect(shouldRunReviewerForRound(0, 2)).toBe(false);
    expect(shouldRunReviewerForRound(1, 2)).toBe(true);
    expect(shouldRunReviewerForRound(2, 2)).toBe(false);
    expect(shouldRunReviewerForRound(3, 2)).toBe(true);
  });

  it('formats feedback even when findings exist without suggestions', () => {
    expect(formatReviewFeedback({
      assessment: 'needs_correction',
      summary: 'The verification step was skipped.',
      blockingFindings: ['The verification step was skipped.'],
      suggestions: [],
      scorecard: {
        contractAdherence: { score: 4, passed: false, findings: ['The verification step was skipped.'] },
        correctness: { score: 4, passed: false, findings: ['The verification step was skipped.'] },
        safety: { score: 8, passed: true, findings: [] },
        efficiency: { score: 6, passed: true, findings: [] },
        verificationQuality: { score: 3, passed: false, findings: ['The verification step was skipped.'] },
      },
      shouldContinue: true,
    }, 2)).toBe('[Review feedback after round 3]: The verification step was skipped.\nBlocking findings: The verification step was skipped.');
  });

  it('returns null for passing reviews', () => {
    expect(formatReviewFeedback({
      assessment: 'pass',
      summary: 'All good.',
      blockingFindings: [],
      suggestions: ['Keep going'],
      scorecard: {
        contractAdherence: { score: 8, passed: true, findings: [] },
        correctness: { score: 8, passed: true, findings: [] },
        safety: { score: 8, passed: true, findings: [] },
        efficiency: { score: 8, passed: true, findings: [] },
        verificationQuality: { score: 8, passed: true, findings: [] },
      },
      shouldContinue: true,
    }, 0)).toBeNull();
  });
});