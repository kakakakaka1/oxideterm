// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

export type OrchestratorObligation = {
  mode: 'auto' | 'required';
  reason: string;
  candidateTools: string[];
};

const DISCOVERY_RE = /(?:有哪些|哪些|列出|看看|查看|show|list|available|hosts?|targets?|connections?|主机|连接).*(?:可用|远程|主机|连接|target|host|connection)?/i;
const ACTION_RE = /(?:连接|打开|执行|运行|修改|设置|上传|下载|读取|写入|搜索|connect|open|run|execute|modify|set|upload|download|read|write|search)/i;

export function classifyOrchestratorObligation(text: string): OrchestratorObligation {
  if (DISCOVERY_RE.test(text) && !/连接到|connect to|run on|在.*运行|执行.*在/.test(text)) {
    return {
      mode: 'required',
      reason: 'The user is asking for real available app targets; call list_targets before answering.',
      candidateTools: ['list_targets'],
    };
  }

  if (ACTION_RE.test(text)) {
    return {
      mode: 'required',
      reason: 'The request asks OxideTerm to inspect, connect, execute, open, or modify real app state.',
      candidateTools: ['list_targets', 'select_target', 'connect_target', 'run_command', 'open_app_surface', 'read_resource', 'write_resource'],
    };
  }

  return { mode: 'auto', reason: 'No mandatory app action detected.', candidateTools: [] };
}

export function buildOrchestratorSystemPrompt(): string {
  return [
    '## OxideSens Tool System',
    'You are using the OxideSens task-tool orchestrator. You only see high-level task tools; do not invent low-level tool names or fake command output.',
    '',
    'Rules:',
    '- For broad discovery such as "which hosts/connections/targets are available", call `list_targets`. Do not call `select_target` for broad discovery.',
    '- For a named object, call `select_target` first unless the user already supplied an exact target_id.',
    '- Saved SSH connections are not live shells. To run a command there, call `connect_target` first, then `run_command` on the returned `ssh-node:*` or `terminal-session:*` target.',
    '- Never open a local terminal and type `ssh user@host` to connect a saved host unless the user explicitly asked for raw/manual ssh.',
    '- Current UI tab is only a ranking hint. It is not a capability boundary.',
    '- Every action that runs, writes, transfers, or sends input must use an explicit target_id.',
    '- If a result has `waitingForInput`, stop and tell the user what input is needed. Do not guess passwords, passphrases, sudo prompts, or repeat the command.',
    '- If a tool fails, use its `nextActions` instead of inventing a new recovery path.',
    '- Do not claim something was connected, executed, read, modified, or verified until a successful tool result proves it.',
  ].join('\n');
}

export function buildOrchestratorObligationPrompt(obligation: OrchestratorObligation): string | null {
  if (obligation.mode !== 'required') return null;
  return [
    '## Required Tool Call',
    obligation.reason,
    `Call one of these tools before the final answer: ${obligation.candidateTools.map((tool) => `\`${tool}\``).join(', ')}.`,
    'If a tool returns disambiguation or multiple targets, ask the user to choose instead of guessing.',
  ].join('\n');
}
