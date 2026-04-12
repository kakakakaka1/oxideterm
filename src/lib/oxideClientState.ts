// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { invoke } from '@tauri-apps/api/core';
import type { ExportPreflightResult, ImportPreview, ImportResult, OxideMetadata } from '../types';
import {
  applyImportedPluginSettingsSnapshot,
  collectPluginSettingsSnapshot,
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
};

type PreviewImportOptions = {
  conflictStrategy?: 'rename' | 'skip' | 'replace' | 'merge';
};

type ImportOxideOptions = PreviewImportOptions & {
  selectedNames?: string[];
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
  const fileData = await invoke<number[]>('export_to_oxide', {
    connectionIds: request.connectionIds,
    password: request.password,
    description: request.description ?? null,
    embedKeys: request.embedKeys ?? null,
    appSettingsJson: includeAppSettings ? clientState.appSettingsJson : null,
    pluginSettings: includePluginSettings && clientState.pluginSettings.length > 0
      ? clientState.pluginSettings
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
  const envelope = await invoke<ImportFromOxideEnvelope>('import_from_oxide', {
    fileData: Array.from(fileData),
    password,
    selectedNames: options?.selectedNames ?? null,
    conflictStrategy: options?.conflictStrategy ?? null,
  });

  let importedAppSettings = false;
  if (envelope.appSettingsJson) {
    importedAppSettings = await applyImportedSettingsSnapshot(envelope.appSettingsJson);
  }

  const importedPluginSettings = envelope.pluginSettings?.length
    ? applyImportedPluginSettingsSnapshot(envelope.pluginSettings)
    : 0;

  const { appSettingsJson: _appSettingsJson, pluginSettings: _pluginSettings, ...result } = envelope;
  return {
    ...result,
    importedAppSettings,
    importedPluginSettings,
  };
}