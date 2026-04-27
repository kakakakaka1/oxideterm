// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import {
  nodeAgentReadFile,
  nodeAgentWriteFile,
  nodeSftpListDir,
  nodeSftpPreview,
  nodeSftpStartDirectoryTransfer,
  nodeSftpUpload,
  nodeSftpDownload,
  nodeSftpWrite,
} from '../../api';
import { ragSearch } from '../../api';
import { useAppStore } from '../../../store/appStore';
import { useLocalTerminalStore } from '../../../store/localTerminalStore';
import { useSettingsStore } from '../../../store/settingsStore';
import type { TabType } from '../../../types';
import type { AiActionResult, AiTarget } from '../orchestrator/types';
import { failAction } from '../orchestrator/result';
import { getAiTarget, listAiTargets } from './targets';

function truncate(value: string, maxChars = 12000): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function nodeIdFromTarget(target: AiTarget): string | null {
  return target.refs.nodeId ?? null;
}

function jsonOutput(value: unknown): string {
  return truncate(JSON.stringify(value, null, 2));
}

export async function selectAiTarget(options: { query: string; kind?: string; intent?: string }): Promise<AiActionResult> {
  const targets = await listAiTargets({ query: options.query, kind: (options.kind ?? 'all') as never });
  if (targets.length === 0) {
    return failAction('No matching target found.', 'target_not_found', `No target matched "${options.query}".`, 'read', {
      nextActions: [{ action: 'list_targets', args: { query: options.query }, reason: 'Inspect available targets and ask the user to choose.' }],
    });
  }

  if (targets.length > 1) {
    return {
      ok: false,
      summary: 'Multiple targets match. Ask the user to choose one.',
      targets,
      output: targets.map((target, index) => `${index + 1}. ${target.id} — ${target.label} [${target.kind}]`).join('\n'),
      error: { code: 'target_disambiguation_required', message: 'Multiple targets match this query.', recoverable: true },
      nextActions: [{ action: 'select_target', args: { query: options.query, kind: options.kind }, reason: 'Retry with a more specific label, host, or target id.' }],
      risk: 'read',
    };
  }

  const target = targets[0];
  return {
    ok: true,
    summary: `Selected target: ${target.label}`,
    target,
    data: target,
    output: jsonOutput(target),
    risk: 'read',
  };
}

export async function readResource(options: {
  target: AiTarget;
  resource: string;
  path?: string;
  section?: string;
  query?: string;
}): Promise<AiActionResult> {
  const { target, resource } = options;

  if (resource === 'settings' || target.kind === 'settings') {
    const settings = useSettingsStore.getState().settings;
    const section = options.section && options.section in settings
      ? (settings as unknown as Record<string, unknown>)[options.section]
      : settings;
    return {
      ok: true,
      summary: options.section ? `Read settings section ${options.section}.` : 'Read settings.',
      data: section,
      output: jsonOutput(section),
      target,
      risk: 'read',
    };
  }

  if (target.kind === 'rag-index' || resource === 'rag') {
    const query = options.query ?? options.path ?? '';
    const results = await ragSearch({ query, collectionIds: [], topK: 8 });
    return { ok: true, summary: `Found ${results.length} knowledge results.`, data: results, output: jsonOutput(results), target, risk: 'read' };
  }

  const nodeId = nodeIdFromTarget(target);
  if (!nodeId && target.kind !== 'sftp-session') {
    return failAction('Target cannot read resources.', 'unsupported_read_target', `${target.kind} does not expose readable resources.`, 'read', { target });
  }

  const path = options.path;
  if (!path) {
    return failAction('Resource path is required.', 'missing_path', 'read_resource requires path for file or directory resources.', 'read', { target });
  }

  if (resource === 'directory' || resource === 'sftp') {
    const entries = nodeId ? await nodeSftpListDir(nodeId, path) : [];
    return { ok: true, summary: `Listed ${entries.length} entries.`, data: entries, output: jsonOutput(entries), target, risk: 'read' };
  }

  if (resource === 'file' || resource === 'ide') {
    if (nodeId) {
      try {
        const result = await nodeAgentReadFile(nodeId, path);
        return { ok: true, summary: `Read remote file ${path}.`, data: result, output: truncate(result.content), target, risk: 'read' };
      } catch {
        const preview = await nodeSftpPreview(nodeId, path);
        return { ok: true, summary: `Read remote file preview ${path}.`, data: preview, output: jsonOutput(preview), target, risk: 'read' };
      }
    }
  }

  return failAction('Unsupported resource read.', 'unsupported_resource', `Cannot read resource "${resource}" from ${target.kind}.`, 'read', { target });
}

export async function writeResource(options: {
  target: AiTarget;
  resource: string;
  section?: string;
  key?: string;
  value?: unknown;
  path?: string;
  content?: string;
  expectedHash?: string;
  dryRun?: boolean;
}): Promise<AiActionResult> {
  const { target, resource } = options;

  if (resource === 'settings' || target.kind === 'settings') {
    const { section, key } = options;
    if (!section || !key) {
      return failAction('Settings section and key are required.', 'missing_settings_key', 'write_resource(settings) requires section and key.', 'write', { target });
    }
    if (options.dryRun) {
      return { ok: true, summary: `Dry-run settings write ${section}.${key}.`, data: { section, key, value: options.value }, output: 'Dry-run only; settings were not changed.', target, risk: 'write' };
    }
    const store = useSettingsStore.getState() as unknown as Record<string, unknown>;
    const updaterName = `update${section.charAt(0).toUpperCase()}${section.slice(1)}`;
    const updater = store[updaterName];
    if (typeof updater !== 'function') {
      return failAction('Settings section cannot be updated.', 'unsupported_settings_section', `No updater found for ${section}.`, 'write', { target });
    }
    (updater as (key: string, value: unknown) => void)(key, options.value);
    return { ok: true, summary: `Updated settings ${section}.${key}.`, data: { section, key, value: options.value }, output: `${section}.${key} updated.`, target, risk: 'write' };
  }

  const nodeId = nodeIdFromTarget(target);
  if (!nodeId) {
    return failAction('Target cannot write resources.', 'unsupported_write_target', `${target.kind} does not expose writable resources.`, 'write', { target });
  }

  if (resource === 'file') {
    if (!options.path || typeof options.content !== 'string') {
      return failAction('Path and content are required.', 'missing_file_write_args', 'write_resource(file) requires path and content.', 'write', { target });
    }
    if (options.dryRun) {
      return { ok: true, summary: `Dry-run file write ${options.path}.`, output: 'Dry-run only; file was not changed.', target, risk: 'write' };
    }
    try {
      const result = await nodeAgentWriteFile(nodeId, options.path, options.content, options.expectedHash);
      return { ok: true, summary: `Wrote remote file ${options.path}.`, data: result, output: jsonOutput(result), target, risk: 'write' };
    } catch {
      const result = await nodeSftpWrite(nodeId, options.path, options.content);
      return { ok: true, summary: `Wrote remote file ${options.path}.`, data: result, output: jsonOutput(result), target, risk: 'write' };
    }
  }

  return failAction('Unsupported resource write.', 'unsupported_resource', `Cannot write resource "${resource}" from ${target.kind}.`, 'write', { target });
}

export async function transferResource(options: {
  target: AiTarget;
  direction: 'upload' | 'download';
  sourcePath: string;
  destinationPath: string;
}): Promise<AiActionResult> {
  const nodeId = nodeIdFromTarget(options.target);
  if (!nodeId) {
    return failAction('SFTP transfer requires an SSH/SFTP target.', 'missing_node_id', 'transfer_resource requires a target with nodeId.', 'write', { target: options.target });
  }

  const transferId = crypto.randomUUID();
  try {
    const directory = /[\\/]$/.test(options.sourcePath) || /[\\/]$/.test(options.destinationPath);
    if (directory) {
      const response = await nodeSftpStartDirectoryTransfer(
        nodeId,
        options.direction,
        options.direction === 'upload' ? options.sourcePath : options.destinationPath,
        options.direction === 'upload' ? options.destinationPath : options.sourcePath,
        transferId,
        'auto',
      );
      return { ok: true, summary: `Started ${options.direction} directory transfer.`, data: response, output: jsonOutput(response), target: options.target, risk: 'write' };
    }

    if (options.direction === 'upload') {
      await nodeSftpUpload(nodeId, options.sourcePath, options.destinationPath, transferId);
    } else {
      await nodeSftpDownload(nodeId, options.sourcePath, options.destinationPath, transferId);
    }
    return { ok: true, summary: `Completed ${options.direction} transfer.`, data: { transferId }, output: `transfer_id=${transferId}`, target: options.target, risk: 'write' };
  } catch (error) {
    return failAction('SFTP transfer failed.', 'sftp_transfer_failed', error instanceof Error ? error.message : String(error), 'write', { target: options.target });
  }
}

export async function openAppSurface(options: { surface: string; targetId?: string; section?: string }): Promise<AiActionResult> {
  const app = useAppStore.getState();
  const target = options.targetId ? await getAiTarget(options.targetId) : undefined;

  if (options.surface === 'local_terminal' || options.surface === 'terminal') {
    const terminal = await useLocalTerminalStore.getState().createTerminal();
    app.createTab('local_terminal', terminal.id);
    const openedTarget: AiTarget = {
      id: `terminal-session:${terminal.id}`,
      kind: 'terminal-session',
      label: `Local terminal ${terminal.shell.label}`,
      state: 'connected',
      capabilities: ['terminal.observe', 'terminal.send', 'terminal.wait', 'state.list'],
      refs: { sessionId: terminal.id },
      metadata: { terminalType: 'local_terminal' },
    };
    return { ok: true, summary: 'Opened local terminal.', target: openedTarget, data: openedTarget, output: jsonOutput(openedTarget), risk: 'write' };
  }

  const surfaceToTab: Record<string, TabType> = {
    settings: 'settings',
    connection_manager: 'session_manager',
    connection_pool: 'connection_pool',
    connection_monitor: 'connection_monitor',
    file_manager: 'file_manager',
    sftp: 'sftp',
    ide: 'ide',
  };
  const tabType = surfaceToTab[options.surface];
  if (!tabType) {
    return failAction('Unknown app surface.', 'unknown_app_surface', `Unknown app surface: ${options.surface}`, 'write', { target: target ?? undefined });
  }
  app.createTab(tabType, target?.refs.sessionId, { nodeId: target?.refs.nodeId });
  if (options.surface === 'settings' && options.section) {
    window.dispatchEvent(new CustomEvent('oxideterm:open-settings-tab', { detail: { tab: options.section } }));
  }
  return { ok: true, summary: `Opened ${options.surface}.`, target: target ?? undefined, output: `Opened ${options.surface}.`, risk: 'write' };
}

export async function getState(scope: string, targetId?: string): Promise<AiActionResult> {
  const target = targetId ? await getAiTarget(targetId) : undefined;
  if (scope === 'targets' || scope === 'active') {
    const targets = await listAiTargets();
    return { ok: true, summary: `Found ${targets.length} targets.`, targets, data: targets, output: jsonOutput(targets), risk: 'read' };
  }
  if (scope === 'settings') {
    const settings = useSettingsStore.getState().settings;
    const summary = {
      ai: { enabled: settings.ai.enabled, toolUse: settings.ai.toolUse },
      terminal: { renderer: settings.terminal.renderer, encoding: settings.terminal.terminalEncoding },
      sftp: { directoryParallelism: settings.sftp?.directoryParallelism },
    };
    return { ok: true, summary: 'Read settings summary.', data: summary, output: jsonOutput(summary), target: target ?? undefined, risk: 'read' };
  }
  if (scope === 'connections') {
    const targets = (await listAiTargets()).filter((entry) => entry.kind === 'saved-connection' || entry.kind === 'ssh-node');
    return { ok: true, summary: `Found ${targets.length} connection targets.`, targets, data: targets, output: jsonOutput(targets), target: target ?? undefined, risk: 'read' };
  }
  return { ok: true, summary: `State scope ${scope}.`, data: { scope, target }, output: jsonOutput({ scope, target }), target: target ?? undefined, risk: 'read' };
}
