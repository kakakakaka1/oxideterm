import { open } from '@tauri-apps/plugin-dialog';

import type { TrzszSaveRoot } from '@/lib/terminal/trzsz/types';
import { normalizeTrzszDialogSelection } from '@/lib/terminal/trzsz/types';

function getBaseName(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '');
  const tokens = normalized.split(/[\\/]/);
  return tokens[tokens.length - 1] || normalized;
}

export async function chooseSendEntries(directory = false): Promise<string[] | undefined> {
  const selected = await open({
    directory,
    multiple: true,
  });

  return normalizeTrzszDialogSelection(selected);
}

export async function chooseSaveRoot(): Promise<TrzszSaveRoot | undefined> {
  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== 'string') {
    return undefined;
  }

  return {
    rootPath: selected,
    displayName: getBaseName(selected),
    maps: new Map<number, string>(),
  };
}