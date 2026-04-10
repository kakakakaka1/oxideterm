// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type {
  AgentPlanStep,
  AgentReviewAssessment,
  AgentReviewCategory,
  AgentReviewResult,
  AgentReviewScore,
  AgentReviewScorecard,
  AgentRiskFlag,
  AgentRoundContract,
} from '../../types';

type ParsedCompletion = {
  status: 'completed' | 'failed';
  summary: string;
  details: string;
};

const REVIEW_CATEGORIES: AgentReviewCategory[] = [
  'contractAdherence',
  'correctness',
  'safety',
  'efficiency',
  'verificationQuality',
];

const RISK_FLAGS: AgentRiskFlag[] = ['security', 'state-sync', 'destructive-write', 'external-side-effect'];

function stripTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let stringQuote = '"';
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (inString) {
      result += char;
      if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      result += char;
      continue;
    }

    if (char === ',') {
      let nextIndex = i + 1;
      while (nextIndex < input.length && /\s/.test(input[nextIndex])) {
        nextIndex++;
      }
      if (nextIndex < input.length && (input[nextIndex] === '}' || input[nextIndex] === ']')) {
        continue;
      }
    }

    result += char;
  }

  return result;
}

function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = '"';
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function getJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const trimmed = text.trim();
  const fenceRegex = /```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)```/gi;

  for (const match of trimmed.matchAll(fenceRegex)) {
    const candidate = match[1]?.trim();
    if (candidate) candidates.push(candidate);
  }

  if (trimmed) candidates.push(trimmed);

  const balanced = extractBalancedJson(trimmed);
  if (balanced) candidates.push(balanced.trim());

  return [...new Set(candidates)];
}

function tryParseCandidate(candidate: string): unknown | null {
  const attempts = [candidate.trim(), stripTrailingCommas(candidate.trim())];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try next variant
    }
  }
  return null;
}

function parseStructuredPayload(text: string): unknown | null {
  for (const candidate of getJsonCandidates(text)) {
    const parsed = tryParseCandidate(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function splitStepString(value: string): string[] {
  return value
    .split(/\r?\n|;\s*/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => coerceString(item)).filter(Boolean);
  }

  const single = coerceString(value);
  if (!single) return [];
  return splitStepString(single);
}

function normalizePlanStep(value: unknown): AgentPlanStep | null {
  if (typeof value === 'string') {
    const description = value.trim();
    return description ? { description, status: 'pending' } : null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const description = coerceString(
      record.description
      ?? record.step
      ?? record.title
      ?? record.task
      ?? record.content
      ?? record.action
      ?? record.name,
    );
    if (description) {
      return { description, status: 'pending' };
    }
  }

  const fallback = coerceString(value);
  return fallback ? { description: fallback, status: 'pending' } : null;
}

export function parsePlanResponse(text: string): { description: string; steps: AgentPlanStep[] } | null {
  const parsed = parseStructuredPayload(text);
  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, unknown>;
  const plan = ((root.plan ?? root.result ?? root.output ?? root) as Record<string, unknown> | undefined) ?? root;
  const nestedPlan = (plan.plan && typeof plan.plan === 'object') ? plan.plan as Record<string, unknown> : plan;

  let rawSteps = nestedPlan.steps;
  if (typeof rawSteps === 'string') {
    rawSteps = splitStepString(rawSteps);
  }
  if (!Array.isArray(rawSteps)) return null;

  const steps = rawSteps
    .map((step) => normalizePlanStep(step))
    .filter((step): step is AgentPlanStep => step !== null);

  if (steps.length === 0) return null;

  const description = coerceString(nestedPlan.description ?? root.description) || steps[0].description;
  return { description, steps };
}

function normalizeLegacyReviewAssessment(value: unknown): 'on_track' | 'needs_correction' | 'critical_issue' {
  const normalized = coerceString(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'critical' || normalized === 'critical_blocker' || normalized === 'blocker') {
    return 'critical_issue';
  }
  if (normalized === 'needs_revision' || normalized === 'needs_fix' || normalized === 'needs_changes') {
    return 'needs_correction';
  }
  if (normalized === 'critical_issue' || normalized === 'needs_correction' || normalized === 'on_track') {
    return normalized;
  }
  return 'on_track';
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return null;
}

function defaultReviewScore(): AgentReviewScore {
  return { score: 0, passed: true, findings: [] };
}

function defaultScorecard(): AgentReviewScorecard {
  return {
    contractAdherence: defaultReviewScore(),
    correctness: defaultReviewScore(),
    safety: defaultReviewScore(),
    efficiency: defaultReviewScore(),
    verificationQuality: defaultReviewScore(),
  };
}

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(10, numeric));
  }
  return 0;
}

function normalizeReviewScore(value: unknown): AgentReviewScore {
  if (!value || typeof value !== 'object') {
    return defaultReviewScore();
  }

  const record = value as Record<string, unknown>;
  const findings = normalizeStringList(record.findings ?? record.issues ?? record.notes);
  const passed = coerceBoolean(record.passed) ?? coerceBoolean(record.ok) ?? false;
  const score = record.score != null ? normalizeScore(record.score) : passed ? 8 : findings.length > 0 ? 4 : 0;

  return {
    score,
    passed: passed || (findings.length === 0 && score >= 7),
    findings,
  };
}

function normalizeReviewCategoryKey(key: string): AgentReviewCategory | null {
  const normalized = key.replace(/[\s_-]+/g, '').toLowerCase();
  switch (normalized) {
    case 'contractadherence':
    case 'contract':
      return 'contractAdherence';
    case 'correctness':
    case 'correct':
      return 'correctness';
    case 'safety':
    case 'security':
      return 'safety';
    case 'efficiency':
    case 'progress':
      return 'efficiency';
    case 'verificationquality':
    case 'verification':
    case 'verificationcoverage':
      return 'verificationQuality';
    default:
      return null;
  }
}

function normalizeScorecard(value: unknown): AgentReviewScorecard {
  const scorecard = defaultScorecard();
  if (!value || typeof value !== 'object') {
    return scorecard;
  }

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const category = normalizeReviewCategoryKey(rawKey);
    if (!category) continue;
    scorecard[category] = normalizeReviewScore(rawValue);
  }

  return scorecard;
}

function inferAssessmentFromScorecard(scorecard: AgentReviewScorecard): AgentReviewAssessment {
  if (!scorecard.safety.passed) return 'critical_failure';
  if (!scorecard.contractAdherence.passed || !scorecard.verificationQuality.passed) return 'needs_correction';
  if (!scorecard.correctness.passed || !scorecard.efficiency.passed) return 'needs_correction';
  return 'pass';
}

function normalizeReviewAssessment(value: unknown, scorecard: AgentReviewScorecard): AgentReviewAssessment {
  const normalized = coerceString(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (['pass', 'passed', 'on_track', 'ok', 'success'].includes(normalized)) return 'pass';
  if (['needs_correction', 'needs_revision', 'needs_fix', 'needs_changes'].includes(normalized)) return 'needs_correction';
  if (['reset_required', 'restart_required', 'handoff_required'].includes(normalized)) return 'reset_required';
  if (['critical_failure', 'critical_issue', 'critical', 'blocker', 'critical_blocker'].includes(normalized)) return 'critical_failure';
  return inferAssessmentFromScorecard(scorecard);
}

function collectBlockingFindings(scorecard: AgentReviewScorecard, fallback: string): string[] {
  const findings: string[] = [];
  let hasFailedCategory = false;
  for (const category of REVIEW_CATEGORIES) {
    const entry = scorecard[category];
    if (!entry.passed) {
      hasFailedCategory = true;
      findings.push(...entry.findings);
    }
  }
  if (!hasFailedCategory) {
    return [];
  }
  if (findings.length === 0 && fallback) {
    findings.push(fallback);
  }
  return [...new Set(findings)];
}

function buildLegacyScorecard(assessment: 'on_track' | 'needs_correction' | 'critical_issue', findings: string): AgentReviewScorecard {
  const scorecard = defaultScorecard();
  const findingList = findings ? [findings] : [];

  if (assessment === 'on_track') {
    for (const category of REVIEW_CATEGORIES) {
      scorecard[category] = { score: 8, passed: true, findings: [] };
    }
    return scorecard;
  }

  scorecard.contractAdherence = { score: 4, passed: false, findings: findingList };
  scorecard.correctness = { score: 4, passed: false, findings: findingList };
  scorecard.efficiency = { score: 6, passed: true, findings: [] };
  scorecard.verificationQuality = { score: 4, passed: false, findings: findingList };
  scorecard.safety = {
    score: assessment === 'critical_issue' ? 1 : 8,
    passed: assessment !== 'critical_issue',
    findings: assessment === 'critical_issue' ? findingList : [],
  };
  return scorecard;
}

function normalizeRiskFlags(value: unknown): AgentRiskFlag[] {
  return normalizeStringList(value)
    .map((flag) => flag.toLowerCase().trim())
    .map((flag) => RISK_FLAGS.find((entry) => entry === flag) ?? null)
    .filter((flag): flag is AgentRiskFlag => flag !== null);
}

function normalizeApprovalCount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeRoundContract(value: unknown): AgentRoundContract | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const objective = coerceString(record.objective ?? record.goal ?? record.summary ?? record.step);
  if (!objective) return null;

  const approvalPlanRecord = (record.approvalPlan && typeof record.approvalPlan === 'object')
    ? record.approvalPlan as Record<string, unknown>
    : {};

  return {
    id: coerceString(record.id) || crypto.randomUUID(),
    taskId: coerceString(record.taskId),
    roundIndex: Math.max(0, Number(record.roundIndex ?? 0) || 0),
    objective,
    scopeIn: normalizeStringList(record.scopeIn ?? record.scope_in),
    scopeOut: normalizeStringList(record.scopeOut ?? record.scope_out),
    plannedActions: normalizeStringList(record.plannedActions ?? record.actions ?? record.planned_actions),
    expectedTools: normalizeStringList(record.expectedTools ?? record.expected_tools ?? record.tools),
    verificationChecklist: normalizeStringList(record.verificationChecklist ?? record.verification ?? record.verification_checklist),
    exitCriteria: normalizeStringList(record.exitCriteria ?? record.exit_criteria),
    riskFlags: normalizeRiskFlags(record.riskFlags ?? record.risks ?? record.risk_flags),
    approvalPlan: {
      expectedApprovalCount: normalizeApprovalCount(approvalPlanRecord.expectedApprovalCount ?? approvalPlanRecord.expected_approval_count),
      requiresUserApprovalFor: normalizeStringList(approvalPlanRecord.requiresUserApprovalFor ?? approvalPlanRecord.requires_user_approval_for),
    },
  };
}

export function parseRoundContractResponse(text: string): AgentRoundContract | null {
  const parsed = parseStructuredPayload(text);
  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, unknown>;
  const contractRoot = ((root.contract ?? root.result ?? root.output ?? root) as Record<string, unknown> | undefined) ?? root;
  const nested = (contractRoot.contract && typeof contractRoot.contract === 'object')
    ? contractRoot.contract as Record<string, unknown>
    : contractRoot;

  return normalizeRoundContract(nested);
}

export function parseReviewResponse(text: string): AgentReviewResult | null {
  const parsed = parseStructuredPayload(text);
  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, unknown>;
  const review = ((root.review ?? root.result ?? root.output ?? root) as Record<string, unknown> | undefined) ?? root;
  const nestedReview = (review.review && typeof review.review === 'object') ? review.review as Record<string, unknown> : review;

  const findings = coerceString(
    nestedReview.findings
    ?? nestedReview.summary
    ?? nestedReview.finding
    ?? nestedReview.reason,
  );
  const suggestions = normalizeStringList(
    nestedReview.suggestions
    ?? nestedReview.recommendations
    ?? nestedReview.recommendation
    ?? nestedReview.actions,
  );
  const scorecard = normalizeScorecard(nestedReview.scorecard ?? nestedReview.scores ?? nestedReview.grades);

  const hasStructuredScorecard = Object.values(scorecard).some((entry) => entry.findings.length > 0 || entry.score > 0 || entry.passed === false);
  const legacyAssessment = normalizeLegacyReviewAssessment(
    nestedReview.assessment
    ?? nestedReview.status
    ?? nestedReview.severity,
  );
  const effectiveScorecard = hasStructuredScorecard ? scorecard : buildLegacyScorecard(legacyAssessment, findings);
  const assessment = normalizeReviewAssessment(
    nestedReview.assessment
    ?? nestedReview.status
    ?? nestedReview.severity,
    effectiveScorecard,
  );

  const explicitContinue = coerceBoolean(
    nestedReview.should_continue
    ?? nestedReview.shouldContinue
    ?? nestedReview.continue,
  );

  if (!findings && suggestions.length === 0 && !('assessment' in nestedReview) && explicitContinue === null && !hasStructuredScorecard) {
    return null;
  }

  return {
    assessment,
    summary: findings || 'Reviewer requested course correction.',
    blockingFindings: collectBlockingFindings(effectiveScorecard, findings),
    suggestions,
    scorecard: effectiveScorecard,
    shouldContinue: explicitContinue ?? (assessment !== 'critical_failure'),
  };
}

function normalizeCompletionStatus(value: unknown): ParsedCompletion['status'] | null {
  const normalized = coerceString(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return null;
  if (['completed', 'complete', 'success', 'succeeded', 'done'].includes(normalized)) {
    return 'completed';
  }
  if (['failed', 'fail', 'error', 'errored', 'blocked', 'incomplete', 'cancelled', 'canceled'].includes(normalized)) {
    return 'failed';
  }
  return null;
}

function normalizeDetails(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseCompletionResponse(text: string): ParsedCompletion | null {
  const parsed = parseStructuredPayload(text);
  if (!parsed || typeof parsed !== 'object') return null;

  const root = parsed as Record<string, unknown>;
  const completion = ((root.result ?? root.output ?? root.completion ?? root) as Record<string, unknown> | undefined) ?? root;
  const nestedCompletion = (completion.completion && typeof completion.completion === 'object')
    ? completion.completion as Record<string, unknown>
    : completion;

  const status = normalizeCompletionStatus(
    nestedCompletion.status
    ?? nestedCompletion.result
    ?? nestedCompletion.outcome,
  );
  const summary = coerceString(
    nestedCompletion.summary
    ?? nestedCompletion.message
    ?? nestedCompletion.findings,
  );

  if (!status || !summary) return null;

  return {
    status,
    summary,
    details: normalizeDetails(nestedCompletion.details ?? nestedCompletion.detail ?? nestedCompletion.metadata),
  };
}