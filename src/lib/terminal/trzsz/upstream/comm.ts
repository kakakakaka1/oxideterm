import pako from 'pako';
import * as Base64 from 'base64-js';

export const trzszVersion = '1.1.6';

export function strToUint8(str: string): Uint8Array {
  return Uint8Array.from(str, (value) => value.charCodeAt(0));
}

export async function uint8ToStr(
  buffer: Uint8Array,
  encoding: 'binary' | 'utf8' = 'binary',
): Promise<string> {
  if (encoding === 'utf8') {
    return new TextDecoder().decode(buffer);
  }

  return String.fromCharCode(...buffer);
}

export function strToArrBuf(str: string): ArrayBuffer {
  return strToUint8(str).buffer as ArrayBuffer;
}

export function encodeBuffer(buffer: string | Uint8Array): string {
  return Base64.fromByteArray(pako.deflate(buffer));
}

export function decodeBuffer(buffer: string): Uint8Array {
  return pako.inflate(Base64.toByteArray(buffer));
}

export class TrzszError extends Error {
  private readonly type: string | null;
  private readonly trace: boolean;

  constructor(message: string, type: string | null = null, trace = false) {
    if (type === 'fail' || type === 'FAIL' || type === 'EXIT') {
      try {
        message = new TextDecoder().decode(decodeBuffer(message));
      } catch (error) {
        message = `decode [${message}] error: ${String(error)}`;
      }
    } else if (type) {
      message = `[TrzszError] ${type}: ${message}`;
    }

    super(message);
    Object.setPrototypeOf(this, TrzszError.prototype);
    this.name = 'TrzszError';
    this.type = type;
    this.trace = trace;
  }

  isTraceBack(): boolean {
    if (this.type === 'fail' || this.type === 'EXIT') {
      return false;
    }

    return this.trace;
  }

  isRemoteExit(): boolean {
    return this.type === 'EXIT';
  }

  isRemoteFail(): boolean {
    return this.type === 'fail' || this.type === 'FAIL';
  }

  isStopAndDelete(): boolean {
    return this.type === 'fail' && this.message === 'Stopped and deleted';
  }

  static getErrorMessage(error: Error): string {
    if (error instanceof TrzszError && !error.isTraceBack()) {
      return error.message;
    }

    return error.stack ?? error.toString();
  }
}

export type TrzszFile = {
  closeFile: () => void;
};

export type TrzszFileReader = TrzszFile & {
  getPathId: () => number;
  getRelPath: () => string[];
  isDir: () => boolean;
  getSize: () => number;
  readFile: (buffer: ArrayBuffer) => Promise<Uint8Array>;
};

export type TrzszFileWriter = TrzszFile & {
  getFileName: () => string;
  getLocalName: () => string;
  isDir: () => boolean;
  writeFile: (buffer: Uint8Array) => Promise<void>;
  deleteFile: () => Promise<string>;
  commitFile?: () => Promise<void>;
  finishFile?: () => Promise<void>;
  abortFile?: () => Promise<void>;
};

export type OpenSaveFile = (
  saveParam: unknown,
  fileName: string,
  directory: boolean,
  overwrite: boolean,
) => Promise<TrzszFileWriter>;

export type ProgressCallback = {
  onNum: (num: number) => void;
  onName: (name: string) => void;
  onSize: (size: number) => void;
  onStep: (step: number) => void;
  onDone: () => void;
};

export function checkDuplicateNames(files: TrzszFileReader[]): void {
  const names = new Set<string>();
  for (const file of files) {
    const path = file.getRelPath().join('/');
    if (names.has(path)) {
      throw new TrzszError(`Duplicate name: ${path}`);
    }
    names.add(path);
  }
}

export function isArrayOfType(array: unknown, type: string): boolean {
  if (!Array.isArray(array)) {
    return false;
  }

  return array.every((value) => typeof value === type);
}

export function isVT100End(charCode: number): boolean {
  return (charCode >= 0x61 && charCode <= 0x7a) || (charCode >= 0x41 && charCode <= 0x5a);
}

export function stripServerOutput(output: string | ArrayBuffer | Uint8Array | Blob): string | ArrayBuffer | Uint8Array | Blob {
  let bytes: Uint8Array;
  if (typeof output === 'string') {
    bytes = strToUint8(output);
  } else if (output instanceof ArrayBuffer) {
    bytes = new Uint8Array(output);
  } else if (output instanceof Uint8Array) {
    bytes = output;
  } else {
    return output;
  }

  const buffer = new Uint8Array(bytes.length);
  let skipVT100 = false;
  let index = 0;
  for (const charCode of bytes) {
    if (skipVT100) {
      if (isVT100End(charCode)) {
        skipVT100 = false;
      }
      continue;
    }

    if (charCode === 0x1b) {
      skipVT100 = true;
      continue;
    }

    buffer[index] = charCode;
    index += 1;
  }

  while (index > 0 && (buffer[index - 1] === 0x0d || buffer[index - 1] === 0x0a)) {
    index -= 1;
  }

  const result = buffer.subarray(0, index);
  if (result.length > 100) {
    return output;
  }

  return String.fromCharCode(...result);
}

export const TmuxMode = {
  NoTmux: 0,
  TmuxNormalMode: 1,
  TmuxControlMode: 2,
} as const;

export async function resetStdinTty(): Promise<void> {}

export async function tmuxRefreshClient(): Promise<void> {}

export function formatSavedFiles(fileNames: string[], destPath: string): string {
  let message = `Saved ${fileNames.length} ${fileNames.length > 1 ? 'files/directories' : 'file/directory'}`;
  if (destPath.length > 0) {
    message += ` to ${destPath}`;
  }

  return [message].concat(fileNames).join('\r\n- ');
}

export function stripTmuxStatusLine(buffer: string): string {
  let nextBuffer = buffer;
  while (true) {
    const beginIndex = nextBuffer.indexOf('\x1bP=');
    if (beginIndex < 0) {
      return nextBuffer;
    }

    let bufferIndex = beginIndex + 3;
    const midIndex = nextBuffer.substring(bufferIndex).indexOf('\x1bP=');
    if (midIndex < 0) {
      return nextBuffer.substring(0, beginIndex);
    }

    bufferIndex += midIndex + 3;
    const endIndex = nextBuffer.substring(bufferIndex).indexOf('\x1b\\');
    if (endIndex < 0) {
      return nextBuffer.substring(0, beginIndex);
    }

    bufferIndex += endIndex + 2;
    nextBuffer = nextBuffer.substring(0, beginIndex) + nextBuffer.substring(bufferIndex);
  }
}