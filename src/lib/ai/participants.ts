// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * @ Participants Registry
 *
 * Participants let users explicitly route their query to a specific domain
 * (e.g. `@sftp list /var/www`) regardless of which tab is currently active.
 *
 * When a participant is used:
 *   1. Its context injection runs automatically
 *   2. Its system prompt modifier is appended
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type ParticipantDef = {
  /** Unique name (used after @) */
  name: string;
  /** i18n key for display label */
  labelKey: string;
  /** i18n key for description */
  descriptionKey: string;
  /** Lucide icon name */
  icon: string;
  /** Text appended to system prompt */
  systemPromptModifier: string;
  /** Auto-inject this context type */
  autoContext?: 'terminal' | 'sftp' | 'ide' | 'local';
};

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

export const PARTICIPANTS: ParticipantDef[] = [
  {
    name: 'terminal',
    labelKey: 'ai.participant.terminal',
    descriptionKey: 'ai.participant.terminal_desc',
    icon: 'Terminal',
    systemPromptModifier:
      'The user is asking about their SSH remote terminal session. Focus on terminal operations, shell commands, and remote system administration.',
    autoContext: 'terminal',
  },
  {
    name: 'sftp',
    labelKey: 'ai.participant.sftp',
    descriptionKey: 'ai.participant.sftp_desc',
    icon: 'FolderOpen',
    systemPromptModifier:
      'The user is asking about remote file management via SFTP. Focus on file operations, directory navigation, file content inspection, and file transfers.',
    autoContext: 'sftp',
  },
  {
    name: 'ide',
    labelKey: 'ai.participant.ide',
    descriptionKey: 'ai.participant.ide_desc',
    icon: 'Code2',
    systemPromptModifier:
      'The user is asking about code editing in IDE mode. Focus on the project structure, code analysis, editing operations, and programming assistance.',
    autoContext: 'ide',
  },
  {
    name: 'connection',
    labelKey: 'ai.participant.connection',
    descriptionKey: 'ai.participant.connection_desc',
    icon: 'Link',
    systemPromptModifier:
      'The user is asking about SSH connections, session management, or port forwarding. Focus on connection status, configuration, and network infrastructure.',
  },
  {
    name: 'system',
    labelKey: 'ai.participant.system',
    descriptionKey: 'ai.participant.system_desc',
    icon: 'Activity',
    systemPromptModifier:
      'The user is asking about system monitoring, health checks, or resource usage. Focus on diagnostics, performance metrics, and operational status.',
  },
  {
    name: 'local',
    labelKey: 'ai.participant.local',
    descriptionKey: 'ai.participant.local_desc',
    icon: 'Monitor',
    systemPromptModifier:
      'The user is asking about their local terminal (not SSH). Focus on local shell operations, local filesystem, and local system administration.',
    autoContext: 'local',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Lookup Helpers
// ═══════════════════════════════════════════════════════════════════════════

const participantMap = new Map(PARTICIPANTS.map(p => [p.name, p]));

/** Resolve a participant name to its definition. */
export function resolveParticipant(name: string): ParticipantDef | undefined {
  return participantMap.get(name);
}

/** Filter participants by partial name for autocomplete. */
export function filterParticipants(partial: string): ParticipantDef[] {
  const lower = partial.toLowerCase();
  return PARTICIPANTS.filter(p => p.name.startsWith(lower));
}
