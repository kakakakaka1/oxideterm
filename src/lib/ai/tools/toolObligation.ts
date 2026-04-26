// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { TabType } from '../../../types';
import type { ToolIntent } from './toolDefinitions';
import { inferToolIntents, scoreToolsForRequest } from './toolPlanner';

export type ToolObligationMode = 'required' | 'optional' | 'none';

export type ToolObligation = {
  mode: ToolObligationMode;
  reason: string;
  intents: ToolIntent[];
  candidateTools: string[];
};

export type ToolObligationInput = {
  text: string;
  activeTabType?: TabType | null;
  intents?: Iterable<ToolIntent>;
  availableToolNames?: Iterable<string>;
  disabledTools?: Set<string>;
};

const ACTION_PATTERNS = [
  /\b(?:open|connect|run|execute|start|stop|restart|read|write|edit|modify|change|set|show|list|inspect|check|diagnose|search|upload|download)\b/i,
  /(?:打开|连接|连上|执行|运行|启动|停止|重启|读取|写入|编辑|修改|改成|设置|开启|关闭|列出|查看|检查|诊断|搜索|上传|下载|切到|进入)/i,
];

const LIVE_STATE_PATTERNS = [
  /\b(?:current|active|now|this terminal|this session|saved connection|settings|status|health|buffer|screen)\b/i,
  /(?:当前|现在|这个终端|这个会话|已保存连接|保存的连接|设置|状态|健康|屏幕|缓冲区|本地|远程|SFTP|插件|知识库)/i,
];

const USER_SUPPLIED_EVIDENCE_PATTERNS = [
  /```[\s\S]+```/,
  /\b(?:error|exception|traceback|stack|stderr|stdout)\b/i,
  /(?:报错|错误|日志|输出|堆栈|截图里|这段)/i,
];

const CONCEPTUAL_PATTERNS = [
  /\b(?:why|how|what|explain|plan|design|compare|evaluate|think|should)\b/i,
  /(?:为什么|如何|是什么|解释|计划|方案|设计|比较|评价|思考|应该|有没有必要)/i,
];

const REQUIRED_INTENTS = new Set<ToolIntent>([
  'command',
  'terminal_interaction',
  'connection',
  'settings',
  'remote_file',
  'local_shell',
  'sftp',
  'ide',
  'monitoring',
  'navigation',
  'plugin',
  'knowledge',
  'status',
]);

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function candidateToolsFor(input: ToolObligationInput, intents: ToolIntent[]): string[] {
  const available = input.availableToolNames ? new Set(input.availableToolNames) : null;
  const scores = scoreToolsForRequest({
    activeTabType: input.activeTabType ?? null,
    hasAnySSHSession: true,
    userMessage: input.text,
    intents,
    disabledTools: input.disabledTools,
  });

  return scores
    .map((score) => score.toolName)
    .filter((toolName) => !available || available.has(toolName))
    .slice(0, 8);
}

export function classifyToolObligation(input: ToolObligationInput): ToolObligation {
  const text = input.text.trim();
  const intents = unique(input.intents ?? inferToolIntents({ text, activeTabType: input.activeTabType ?? null }));
  const candidateTools = candidateToolsFor(input, intents);

  if (!text) {
    return {
      mode: 'none',
      reason: 'empty-request',
      intents,
      candidateTools,
    };
  }

  const hasAction = matchesAny(text, ACTION_PATTERNS);
  const referencesLiveState = matchesAny(text, LIVE_STATE_PATTERNS);
  const requiredByIntent = intents.some((intent) => REQUIRED_INTENTS.has(intent));
  const hasUserEvidence = matchesAny(text, USER_SUPPLIED_EVIDENCE_PATTERNS);
  const isConceptual = matchesAny(text, CONCEPTUAL_PATTERNS);

  if (hasUserEvidence && isConceptual) {
    return {
      mode: candidateTools.length > 0 ? 'optional' : 'none',
      reason: 'user-supplied-evidence',
      intents,
      candidateTools,
    };
  }

  if ((hasAction && (requiredByIntent || referencesLiveState)) || (referencesLiveState && requiredByIntent)) {
    return {
      mode: 'required',
      reason: 'request-requires-live-app-or-terminal-state',
      intents,
      candidateTools,
    };
  }

  if (hasAction && candidateTools.length > 0 && !hasUserEvidence) {
    return {
      mode: 'required',
      reason: 'action-request-needs-tool-result',
      intents,
      candidateTools,
    };
  }

  if (hasUserEvidence || isConceptual) {
    return {
      mode: candidateTools.length > 0 ? 'optional' : 'none',
      reason: hasUserEvidence ? 'user-supplied-evidence' : 'conceptual-request',
      intents,
      candidateTools,
    };
  }

  return {
    mode: candidateTools.length > 0 ? 'optional' : 'none',
    reason: candidateTools.length > 0 ? 'tool-may-improve-answer' : 'no-tool-signal',
    intents,
    candidateTools,
  };
}
