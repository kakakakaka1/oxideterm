// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { invoke } from '@tauri-apps/api/core';
import type { ExportPreflightResult, ImportPreview, ImportResult, OxideMetadata } from '../types';
import {
  applyImportedPluginSettingsSnapshot,
  collectPluginSettingsSnapshot,
  parseSettingStorageKey,
  type PluginSettingSnapshotEntry,
} from './plugin/pluginSettingsManager';
import {
  applyImportedSettingsSnapshot,
  exportCurrentSettingsSnapshot,
} from '../store/settingsStore';

type ExportOxideRequest = {
  connectionIds: string[];
  password: string;
  description?: string | null;
  embedKeys?: boolean | null;
  includeAppSettings?: boolean;
  includePluginSettings?: boolean;
  selectedPluginIds?: string[];
  selectedForwardIds?: string[];
};

type PreviewImportOptions = {
  conflictStrategy?: 'rename' | 'skip' | 'replace' | 'merge';
};

type ImportOxideOptions = PreviewImportOptions & {
  selectedNames?: string[];
  importAppSettings?: boolean;
  importPluginSettings?: boolean;
  selectedPluginIds?: string[];
  importForwards?: boolean;
};

type ImportFromOxideEnvelope = Omit<ImportResult, 'importedAppSettings' | 'importedPluginSettings'> & {
  appSettingsJson?: string | null;
  pluginSettings?: PluginSettingSnapshotEntry[] | null;
};

function buildClientStatePayload(): {
  appSettingsJson: string | null;
  pluginSettings: PluginSettingSnapshotEntry[];
} {
  return {
    appSettingsJson: exportCurrentSettingsSnapshot(),
    pluginSettings: collectPluginSettingsSnapshot(),
  };
}

export async function preflightOxideExport(
  connectionIds: string[],
  options?: { embedKeys?: boolean },
): Promise<ExportPreflightResult> {
  return invoke<ExportPreflightResult>('preflight_export', {
    connectionIds,
    embedKeys: options?.embedKeys ?? null,
  });
}

export async function exportOxideWithClientState(
  request: ExportOxideRequest,
): Promise<Uint8Array> {
  const includeAppSettings = request.includeAppSettings ?? true;
  const includePluginSettings = request.includePluginSettings ?? true;
  const clientState = (includeAppSettings || includePluginSettings)
    ? buildClientStatePayload()
    : { appSettingsJson: null, pluginSettings: [] };
  const filteredPluginSettings = includePluginSettings && clientState.pluginSettings.length > 0
    ? (request.selectedPluginIds?.length
      ? clientState.pluginSettings.filter((entry) => {
          const parsed = parseSettingStorageKey(entry.storageKey);
          return parsed ? request.selectedPluginIds!.includes(parsed.pluginId) : false;
        })
      : clientState.pluginSettings)
    : [];
  const fileData = await invoke<number[]>('export_to_oxide', {
    connectionIds: request.connectionIds,
    password: request.password,
    description: request.description ?? null,
    embedKeys: request.embedKeys ?? null,
    selectedForwardIds: request.selectedForwardIds ?? null,
    appSettingsJson: includeAppSettings ? clientState.appSettingsJson : null,
    pluginSettings: filteredPluginSettings.length > 0
      ? filteredPluginSettings
      : null,
  });
  return new Uint8Array(fileData);
}

export async function validateOxideFile(fileData: Uint8Array): Promise<OxideMetadata> {
  return invoke<OxideMetadata>('validate_oxide_file', {
    fileData: Array.from(fileData),
  });
}

export async function previewOxideImport(
  fileData: Uint8Array,
  password: string,
  options?: PreviewImportOptions,
): Promise<ImportPreview> {
  return invoke<ImportPreview>('preview_oxide_import', {
    fileData: Array.from(fileData),
    password,
    conflictStrategy: options?.conflictStrategy ?? null,
  });
}

export async function importOxideWithClientState(
  fileData: Uint8Array,
  password: string,
  options?: ImportOxideOptions,
): Promise<ImportResult> {
  const shouldImportApp = options?.importAppSettings !== false;
  const shouldImportPlugin = options?.importPluginSettings !== false;
  const envelope = await invoke<ImportFromOxideEnvelope>('import_from_oxide', {
    fileData: Array.from(fileData),
    password,
    selectedNames: options?.selectedNames ?? null,
    conflictStrategy: options?.conflictStrategy ?? null,
    importForwards: options?.importForwards ?? null,
  });

  let importedAppSettings = false;
  if (shouldImportApp && envelope.appSettingsJson) {
    importedAppSettings = await applyImportedSettingsSnapshot(envelope.appSettingsJson);
  }

  const filteredPluginSettings = shouldImportPlugin && envelope.pluginSettings?.length
    ? (options?.selectedPluginIds
      ? (options.selectedPluginIds.length > 0
        ? envelope.pluginSettings.filter((entry) => {
            const parsed = parseSettingStorageKey(entry.storageKey);
            return parsed ? options.selectedPluginIds!.includes(parsed.pluginId) : false;
          })
        : [])
      : envelope.pluginSettings)
    : [];

  const importedPluginSettings = filteredPluginSettings.length
    ? applyImportedPluginSettingsSnapshot(filteredPluginSettings)
    : 0;

  const { appSettingsJson: _appSettingsJson, pluginSettings: _pluginSettings, ...result } = envelope;
  return {
    ...result,
    importedAppSettings,
    skippedAppSettings: !shouldImportApp && Boolean(envelope.appSettingsJson),
    importedPluginSettings,
    skippedPluginSettings: !shouldImportPlugin && Boolean(envelope.pluginSettings?.length),
  };
}