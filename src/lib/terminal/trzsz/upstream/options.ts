import type { TrzszSaveRoot } from '@/lib/terminal/trzsz/types';
import type { OpenSaveFile, TrzszFileReader } from '@/lib/terminal/trzsz/upstream/comm';

export type TrzszOptions = {
  writeToTerminal?: (output: string | ArrayBuffer | Uint8Array | Blob) => void;
  sendToServer?: (input: string | Uint8Array) => void;
  chooseSendFiles?: (directory?: boolean) => Promise<string[] | undefined>;
  buildFileReaders?: (paths: string[], directory: boolean) => Promise<TrzszFileReader[] | undefined>;
  chooseSaveDirectory?: () => Promise<TrzszSaveRoot | undefined>;
  openSaveFile?: OpenSaveFile;
  terminalColumns?: number;
  isWindowsShell?: boolean;
  maxDataChunkSize?: number;
  dragInitTimeout?: number | null;
};