// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { AiToolDefinition } from '../providers';
import type { PluginAiToolDef, PluginManifest, PluginToolCapability } from '../../../types/plugin';
import type { ToolIntent, ToolSideEffect, ToolSpec, ToolTargetRequirement } from './toolDefinitions';
import { createExternalToolSpec } from './toolDefinitions';

function capabilityToSideEffect(capability?: PluginToolCapability): ToolSideEffect {
  switch (capability) {
    case 'command.run':
    case 'terminal.send':
      return 'execute';
    case 'filesystem.write':
      return 'write';
    case 'network.forward':
      return 'network';
    case 'settings.write':
      return 'settings';
    case 'navigation.open':
      return 'navigate';
    default:
      return 'read';
  }
}

function capabilityToIntent(capability?: PluginToolCapability): ToolIntent {
  switch (capability) {
    case 'command.run':
      return 'command';
    case 'terminal.send':
    case 'terminal.observe':
    case 'terminal.wait':
      return 'terminal_interaction';
    case 'filesystem.read':
    case 'filesystem.write':
    case 'filesystem.search':
      return 'remote_file';
    case 'navigation.open':
      return 'navigation';
    case 'network.forward':
      return 'connection';
    case 'settings.read':
    case 'settings.write':
      return 'settings';
    default:
      return 'plugin';
  }
}

function targetKindsToRequirement(targetKinds: readonly string[] | undefined): ToolTargetRequirement {
  if (!targetKinds || targetKinds.length === 0) return 'none';
  if (targetKinds.includes('terminal-session')) return 'session_id';
  if (targetKinds.includes('ssh-node')) return 'active_or_node';
  if (targetKinds.includes('sftp-session')) return 'active_sftp';
  if (targetKinds.includes('ide-workspace')) return 'active_ide';
  if (targetKinds.includes('local-shell')) return 'local_terminal';
  if (targetKinds.includes('app-tab')) return 'app_tab';
  if (targetKinds.includes('mcp-server')) return 'mcp_server';
  return 'none';
}

export function pluginAiToolToDefinition(pluginId: string, tool: PluginAiToolDef): AiToolDefinition {
  return {
    name: `plugin::${pluginId}::${tool.name}`,
    description: `[Plugin: ${pluginId}] ${tool.description}`,
    parameters: tool.parameters ?? { type: 'object', properties: {} },
  };
}

export function pluginAiToolToSpec(pluginId: string, tool: PluginAiToolDef): ToolSpec {
  const primaryCapability = tool.capabilities?.[0];
  const sideEffect = capabilityToSideEffect(primaryCapability);
  const readOnly = sideEffect === 'read';
  const capabilities: PluginToolCapability[] = tool.capabilities?.length ? tool.capabilities : ['plugin.invoke'];
  return createExternalToolSpec({
    definition: pluginAiToolToDefinition(pluginId, tool),
    domain: 'plugin',
    intentTags: [...new Set(capabilities.map(capabilityToIntent))],
    requiredTarget: targetKindsToRequirement(tool.targetKinds),
    sideEffect,
    groupKey: 'plugin',
    readOnly,
    write: !readOnly,
    contextFree: targetKindsToRequirement(tool.targetKinds) === 'none',
  });
}

export function pluginManifestToAiToolSpecs(manifest: PluginManifest): ToolSpec[] {
  const tools = manifest.contributes?.aiTools ?? [];
  return tools.map((tool) => pluginAiToolToSpec(manifest.id, tool));
}
