// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { IDecoration, IMarker, Terminal } from '@xterm/xterm';
import { useAiChatStore } from '@/store/aiChatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { addAiCommandRecord } from '@/lib/ai/orchestrator/ledger';
import { getAiRuntimeEpoch } from '@/lib/ai/orchestrator/runtimeEpoch';

export type TerminalCommandMarkDetectionSource =
  | 'command_bar'
  | 'ai'
  | 'broadcast'
  | 'user_input_observed'
  | 'heuristic'
  | 'shell_integration';

export type TerminalCommandMarkClosedBy =
  | 'next_command'
  | 'shell_integration'
  | 'terminal_reset'
  | 'session_lost'
  | 'interrupted_mode'
  | 'timeout'
  | 'manual'
  | 'unknown';

export type TerminalCommandMarkConfidence = 'high' | 'medium' | 'low';
export type TerminalCommandMarkOutputConfidence = TerminalCommandMarkConfidence | 'unknown';

export type TerminalCommandMark = {
  commandId: string;
  paneId: string;
  sessionId: string;
  nodeId?: string;
  command: string;
  cwd?: string;
  startLine: number;
  endLine?: number;
  isClosed: boolean;
  closedBy?: TerminalCommandMarkClosedBy;
  exitCode?: number | null;
  durationMs?: number;
  runtimeEpoch: string;
  detectionSource: TerminalCommandMarkDetectionSource;
  confidence: TerminalCommandMarkConfidence;
  outputConfidence: TerminalCommandMarkOutputConfidence;
  collapsed: boolean;
  stale: boolean;
  startedAt: number;
  finishedAt?: number;
};

export type TerminalCommandMarkRequest = {
  command: string;
  source: TerminalCommandMarkDetectionSource;
  sessionId: string;
  nodeId?: string;
  cwd?: string | null;
};

type DecorationRecord = {
  marker: IMarker;
  decoration: IDecoration;
};

const MAX_MARKS_PER_PANE = 200;
const MAX_OUTPUT_CHARS = 24000;
const MAX_OUTPUT_LINES = 400;

const marksByPane = new Map<string, TerminalCommandMark[]>();
const decorationsByCommandId = new Map<string, DecorationRecord>();
const listeners = new Set<() => void>();
let sequence = 0;

function nextCommandId(): string {
  sequence += 1;
  return `term-cmd-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error('[TerminalCommandMarks] listener failed:', error);
    }
  }
}

function getAbsoluteCursorLine(term: Terminal): number {
  return term.buffer.active.baseY + term.buffer.active.cursorY;
}

function getLineText(term: Terminal, absoluteLine: number): string {
  const line = term.buffer.active.getLine(absoluteLine);
  return line?.translateToString(true) ?? '';
}

function getOutputRangeText(term: Terminal, mark: TerminalCommandMark): { text: string; truncated: boolean; lineCount: number } {
  const start = mark.startLine + 1;
  const end = typeof mark.endLine === 'number'
    ? mark.endLine
    : Math.min(term.buffer.active.length - 1, getAbsoluteCursorLine(term));
  const lines: string[] = [];
  let charCount = 0;
  let truncated = false;

  for (let line = start; line <= end; line += 1) {
    if (lines.length >= MAX_OUTPUT_LINES || charCount >= MAX_OUTPUT_CHARS) {
      truncated = true;
      break;
    }
    const text = getLineText(term, line);
    charCount += text.length + 1;
    if (charCount > MAX_OUTPUT_CHARS) {
      lines.push(text.slice(0, Math.max(0, MAX_OUTPUT_CHARS - (charCount - text.length - 1))));
      truncated = true;
      break;
    }
    lines.push(text);
  }

  return { text: lines.join('\n'), truncated, lineCount: Math.max(0, end - start + 1) };
}

function isLedgerSource(source: TerminalCommandMarkDetectionSource): boolean {
  return source === 'command_bar' || source === 'ai' || source === 'broadcast' || source === 'shell_integration';
}

function closeOpenMarks(
  paneId: string,
  nextStartLine: number,
  closedBy: TerminalCommandMarkClosedBy,
  outputConfidence: TerminalCommandMarkOutputConfidence,
): void {
  const marks = marksByPane.get(paneId) ?? [];
  for (const mark of marks) {
    if (mark.isClosed) continue;
    mark.isClosed = true;
    mark.closedBy = closedBy;
    mark.outputConfidence = outputConfidence;
    mark.endLine = Math.max(mark.startLine, nextStartLine - 1);
    mark.finishedAt = Date.now();
    mark.durationMs = mark.finishedAt - mark.startedAt;
    if (isLedgerSource(mark.detectionSource) && mark.confidence === 'high') {
      addAiCommandRecord({
        commandId: mark.commandId,
        targetId: mark.nodeId ? `ssh-node:${mark.nodeId}` : undefined,
        sessionId: mark.sessionId,
        nodeId: mark.nodeId,
        command: mark.command,
        cwd: mark.cwd,
        source: mark.detectionSource === 'ai'
          ? 'ai.terminal_input'
          : mark.detectionSource === 'broadcast'
            ? 'broadcast'
            : mark.detectionSource === 'shell_integration'
              ? 'shell_integration'
              : 'command_bar',
        status: mark.stale ? 'stale' : 'completed',
        startedAt: mark.startedAt,
        finishedAt: mark.finishedAt,
        runtimeEpoch: mark.runtimeEpoch,
        risk: 'execute',
        exitCode: mark.exitCode,
        startLine: mark.startLine,
        endLine: mark.endLine,
        detectionSource: mark.detectionSource,
        outputConfidence: mark.outputConfidence,
        stale: mark.stale,
      });
    }
  }
}

function disposeDecoration(commandId: string): void {
  const record = decorationsByCommandId.get(commandId);
  if (!record) return;
  decorationsByCommandId.delete(commandId);
  try {
    record.decoration.dispose();
  } catch {
    // Ignore stale xterm decoration teardown.
  }
  try {
    record.marker.dispose();
  } catch {
    // Ignore stale marker teardown.
  }
}

function trimPaneMarks(paneId: string): void {
  const marks = marksByPane.get(paneId);
  if (!marks || marks.length <= MAX_MARKS_PER_PANE) return;
  const removed = marks.splice(0, marks.length - MAX_MARKS_PER_PANE);
  for (const mark of removed) {
    disposeDecoration(mark.commandId);
  }
}

function renderMarkDecoration(element: HTMLElement, term: Terminal, mark: TerminalCommandMark): void {
  element.classList.add('xterm-command-mark-decoration');
  element.replaceChildren();

  const rail = document.createElement('div');
  rail.className = 'xterm-command-mark-rail';

  const showHoverActions = useSettingsStore.getState().settings.terminal.commandMarks?.showHoverActions ?? true;

  if (!showHoverActions) {
    element.append(rail);
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'xterm-command-mark-actions';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.title = 'Copy command output';
  copy.addEventListener('mousedown', (event) => event.preventDefault());
  copy.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const output = getOutputRangeText(term, mark);
    void navigator.clipboard?.writeText(output.text);
  });

  const ask = document.createElement('button');
  ask.type = 'button';
  ask.textContent = 'Ask';
  ask.title = 'Ask OxideSens about this output';
  ask.addEventListener('mousedown', (event) => event.preventDefault());
  ask.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const output = getOutputRangeText(term, mark);
    const suffix = output.truncated ? '\n\n[Output truncated before sending to AI.]' : '';
    useSettingsStore.getState().setAiSidebarCollapsed(false);
    void useAiChatStore.getState().sendMessage(
      `Analyze this command output:\n\nCommand: ${mark.command}`,
      `Terminal command mark ${mark.commandId}\nCWD: ${mark.cwd ?? 'unknown'}\nLines: ${output.lineCount}\n\n${output.text}${suffix}`,
    );
  });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = mark.collapsed ? 'Expand' : 'Fold';
  toggle.title = 'Toggle logical fold marker';
  toggle.addEventListener('mousedown', (event) => event.preventDefault());
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    mark.collapsed = !mark.collapsed;
    notify();
  });

  actions.append(copy, ask, toggle);
  element.append(rail, actions);
}

export function createTerminalCommandMark(
  term: Terminal,
  paneId: string,
  request: TerminalCommandMarkRequest,
): TerminalCommandMark | null {
  const command = request.command.trim();
  if (!command) return null;
  const settings = useSettingsStore.getState().settings.terminal.commandMarks;
  if (!settings?.enabled) return null;
  if (request.source === 'user_input_observed' && !settings.userInputObserved) return null;
  if (request.source === 'heuristic' && !settings.heuristicDetection) return null;
  if (term.buffer.active.type === 'alternate' || term.modes.mouseTrackingMode !== 'none') return null;

  const startLine = getAbsoluteCursorLine(term);
  const marker = term.registerMarker(0);
  if (!marker) return null;
  const decoration = term.registerDecoration({
    marker,
    x: 0,
    width: Math.max(1, term.cols),
    layer: 'top',
  });
  if (!decoration) {
    marker.dispose();
    return null;
  }

  const mark: TerminalCommandMark = {
    commandId: nextCommandId(),
    paneId,
    sessionId: request.sessionId,
    nodeId: request.nodeId,
    command,
    cwd: request.cwd ?? undefined,
    startLine,
    isClosed: false,
    runtimeEpoch: getAiRuntimeEpoch(),
    detectionSource: request.source,
    confidence: request.source === 'heuristic' || request.source === 'user_input_observed' ? 'low' : 'high',
    outputConfidence: 'unknown',
    collapsed: false,
    stale: false,
    startedAt: Date.now(),
  };

  decoration.onRender((element) => renderMarkDecoration(element, term, mark));
  marker.onDispose(() => {
    decorationsByCommandId.delete(mark.commandId);
    const marks = marksByPane.get(paneId);
    if (!marks) return;
    const index = marks.findIndex((candidate) => candidate.commandId === mark.commandId);
    if (index >= 0) {
      marks.splice(index, 1);
      notify();
    }
  });

  // The xterm marker/decoration is registered first. Only now mutate the store.
  closeOpenMarks(paneId, startLine, 'next_command', 'high');
  decorationsByCommandId.set(mark.commandId, { marker, decoration });
  const marks = marksByPane.get(paneId) ?? [];
  marks.push(mark);
  marksByPane.set(paneId, marks);
  trimPaneMarks(paneId);
  notify();
  return mark;
}

export function closeTerminalCommandMarks(
  paneId: string,
  closedBy: TerminalCommandMarkClosedBy,
  outputConfidence: TerminalCommandMarkOutputConfidence = 'unknown',
  stale = false,
): void {
  const marks = marksByPane.get(paneId) ?? [];
  const now = Date.now();
  for (const mark of marks) {
    if (mark.isClosed) continue;
    mark.isClosed = true;
    mark.closedBy = closedBy;
    mark.outputConfidence = outputConfidence;
    mark.endLine = mark.endLine ?? mark.startLine;
    mark.finishedAt = now;
    mark.durationMs = mark.finishedAt - mark.startedAt;
    mark.stale = stale || mark.stale;
  }
  notify();
}

export function cleanupTerminalCommandMarks(paneId: string): void {
  const marks = [...(marksByPane.get(paneId) ?? [])];
  for (const mark of marks) {
    disposeDecoration(mark.commandId);
  }
  marksByPane.delete(paneId);
  notify();
}

export function listTerminalCommandMarks(paneId: string): TerminalCommandMark[] {
  return (marksByPane.get(paneId) ?? []).map((mark) => ({ ...mark }));
}

export function subscribeTerminalCommandMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
