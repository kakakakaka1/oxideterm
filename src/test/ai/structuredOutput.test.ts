import { describe, expect, it } from 'vitest';

import { parsePlanResponse } from '@/lib/ai/agentPlanner';
import { parseRoundContract } from '@/lib/ai/agentContract';
import { parseReview } from '@/lib/ai/agentReviewer';
import { parseCompletionResponse } from '@/lib/ai/structuredOutput';

describe('planner structured output parsing', () => {
  it('parses prose-wrapped fenced JSON with object-form steps', () => {
    const text = `I will first outline the approach.\n\n\`\`\`JSON
    {
      "plan": {
        "description": "Investigate and repair the service",
        "steps": [
          { "description": "Check service status" },
          { "title": "Inspect recent logs" },
          { "task": "Restart the failing unit" }
        ]
      }
    }
    \`\`\``;

    expect(parsePlanResponse(text)).toEqual({
      description: 'Investigate and repair the service',
      steps: [
        { description: 'Check service status', status: 'pending' },
        { description: 'Inspect recent logs', status: 'pending' },
        { description: 'Restart the failing unit', status: 'pending' },
      ],
    });
  });

  it('parses balanced JSON embedded in prose and tolerates trailing commas', () => {
    const text = `Plan ready:\n{
      "plan": {
        "description": "Recover the deployment",
        "steps": [
          "Read the deployment manifest",
          "Roll out the fixed image",
        ],
      }
    }\nProceed once approved.`;

    expect(parsePlanResponse(text)).toEqual({
      description: 'Recover the deployment',
      steps: [
        { description: 'Read the deployment manifest', status: 'pending' },
        { description: 'Roll out the fixed image', status: 'pending' },
      ],
    });
  });

  it('splits string-based steps into ordered plan items', () => {
    const text = JSON.stringify({
      plan: {
        description: 'Follow a short checklist',
        steps: '1. Check disk\n2. Clear tmp\n- Verify free space',
      },
    });

    expect(parsePlanResponse(text)).toEqual({
      description: 'Follow a short checklist',
      steps: [
        { description: 'Check disk', status: 'pending' },
        { description: 'Clear tmp', status: 'pending' },
        { description: 'Verify free space', status: 'pending' },
      ],
    });
  });
});

describe('reviewer structured output parsing', () => {
  it('parses top-level review drift with synonym keys and synthesizes a scorecard', () => {
    const text = `
    {
      "assessment": "needs revision",
      "summary": "The agent skipped verification.",
      "recommendation": "Re-run the final verification command",
      "shouldContinue": true
    }
    `;

    expect(parseReview(text)).toEqual({
      assessment: 'needs_correction',
      summary: 'The agent skipped verification.',
      blockingFindings: ['The agent skipped verification.'],
      suggestions: ['Re-run the final verification command'],
      scorecard: {
        contractAdherence: { score: 4, passed: false, findings: ['The agent skipped verification.'] },
        correctness: { score: 4, passed: false, findings: ['The agent skipped verification.'] },
        safety: { score: 8, passed: true, findings: [] },
        efficiency: { score: 6, passed: true, findings: [] },
        verificationQuality: { score: 4, passed: false, findings: ['The agent skipped verification.'] },
      },
      shouldContinue: true,
    });
  });

  it('parses fenced JSON review payloads with scorecard fields', () => {
    const text = `\`\`\`json
    {
      "review": {
        "assessment": "critical_failure",
        "summary": "A destructive command targeted the wrong path.",
        "blockingFindings": ["Wrong path targeted"],
        "suggestions": "Stop execution; confirm the target directory before retrying.",
        "scorecard": {
          "safety": { "score": 1, "passed": false, "findings": ["Wrong path targeted"] },
          "correctness": { "score": 3, "passed": false, "findings": ["Wrong path targeted"] },
          "contractAdherence": { "score": 4, "passed": false, "findings": ["Wrong path targeted"] },
          "efficiency": { "score": 5, "passed": true, "findings": [] },
          "verificationQuality": { "score": 5, "passed": true, "findings": [] }
        }
      }
    }
    \`\`\``;

    expect(parseReview(text)).toEqual({
      assessment: 'critical_failure',
      summary: 'A destructive command targeted the wrong path.',
      blockingFindings: ['Wrong path targeted'],
      suggestions: ['Stop execution', 'confirm the target directory before retrying.'],
      scorecard: {
        safety: { score: 1, passed: false, findings: ['Wrong path targeted'] },
        correctness: { score: 3, passed: false, findings: ['Wrong path targeted'] },
        contractAdherence: { score: 4, passed: false, findings: ['Wrong path targeted'] },
        efficiency: { score: 5, passed: true, findings: [] },
        verificationQuality: { score: 5, passed: true, findings: [] },
      },
      shouldContinue: false,
    });
  });

  it('tolerates prose around result-wrapped review JSON', () => {
    const text = `Reviewer output follows:\n{
      "result": {
        "review": {
          "assessment": "pass",
          "summary": "Progress is consistent.",
          "blockingFindings": [],
          "suggestions": ["Keep the current plan"],
          "scorecard": {
            "contractAdherence": { "score": 8, "passed": true, "findings": [] },
            "correctness": { "score": 8, "passed": true, "findings": [] },
            "safety": { "score": 9, "passed": true, "findings": [] },
            "efficiency": { "score": 8, "passed": true, "findings": [] },
            "verificationQuality": { "score": 8, "passed": true, "findings": [] }
          },
          "should_continue": "true"
        }
      }
    }\nEnd of review.`;

    expect(parseReview(text)).toEqual({
      assessment: 'pass',
      summary: 'Progress is consistent.',
      blockingFindings: [],
      suggestions: ['Keep the current plan'],
      scorecard: {
        contractAdherence: { score: 8, passed: true, findings: [] },
        correctness: { score: 8, passed: true, findings: [] },
        safety: { score: 9, passed: true, findings: [] },
        efficiency: { score: 8, passed: true, findings: [] },
        verificationQuality: { score: 8, passed: true, findings: [] },
      },
      shouldContinue: true,
    });
  });
});

describe('round contract parsing', () => {
  it('parses a structured contract payload wrapped in prose', () => {
    const text = `Use this contract:\n{
      "contract": {
        "objective": "Verify the repaired service",
        "scopeIn": ["Run health checks", "Inspect logs"],
        "scopeOut": ["Do not change configuration"],
        "plannedActions": ["Run curl /healthz", "Tail the service log"],
        "expectedTools": ["terminal_exec"],
        "verificationChecklist": ["Health endpoint returns 200"],
        "exitCriteria": ["Health checks pass"],
        "riskFlags": ["external-side-effect"],
        "approvalPlan": {
          "expectedApprovalCount": 1,
          "requiresUserApprovalFor": ["terminal_exec"]
        }
      }
    }`;

    expect(parseRoundContract(text)).toMatchObject({
      objective: 'Verify the repaired service',
      scopeIn: ['Run health checks', 'Inspect logs'],
      scopeOut: ['Do not change configuration'],
      plannedActions: ['Run curl /healthz', 'Tail the service log'],
      expectedTools: ['terminal_exec'],
      verificationChecklist: ['Health endpoint returns 200'],
      exitCriteria: ['Health checks pass'],
      riskFlags: ['external-side-effect'],
      approvalPlan: {
        expectedApprovalCount: 1,
        requiresUserApprovalFor: ['terminal_exec'],
      },
    });
  });
});

describe('completion structured output parsing', () => {
  it('parses prose-wrapped completion JSON with trailing commas and object details', () => {
    const text = `Final status:\n\`\`\`json
    {
      "status": "success",
      "summary": "Service is healthy again",
      "details": { "checks": ["systemctl status", "curl /healthz"] },
    }
    \`\`\``;

    expect(parseCompletionResponse(text)).toEqual({
      status: 'completed',
      summary: 'Service is healthy again',
      details: JSON.stringify({ checks: ['systemctl status', 'curl /healthz'] }, null, 2),
    });
  });

  it('parses result-wrapped failed completions with synonym status', () => {
    const text = JSON.stringify({
      result: {
        outcome: 'blocked',
        message: 'Deployment could not continue',
        detail: 'Missing credentials',
      },
    });

    expect(parseCompletionResponse(text)).toEqual({
      status: 'failed',
      summary: 'Deployment could not continue',
      details: 'Missing credentials',
    });
  });
});