import { api } from '@/lib/api';
import type { TrzszFileReader } from '@/lib/terminal/trzsz/upstream/comm';
import type { TrzszUploadEntryDto } from '@/lib/terminal/trzsz/types';

export class TauriFileReader implements TrzszFileReader {
  private handleId: string | null = null;
  private offset = 0;
  private closed = false;

  constructor(
    private readonly ownerId: string,
    private readonly entry: TrzszUploadEntryDto,
  ) {}

  getPathId(): number {
    return this.entry.pathId;
  }

  getRelPath(): string[] {
    return [...this.entry.relPath];
  }

  isDir(): boolean {
    return this.entry.isDir;
  }

  getSize(): number {
    return this.entry.size;
  }

  async readFile(buffer: ArrayBuffer): Promise<Uint8Array> {
    if (this.closed || this.entry.isDir) {
      return new Uint8Array(0);
    }

    const handleId = await this.ensureHandle();
    const data = await api.trzszReadUploadChunk(this.ownerId, handleId, this.offset, buffer.byteLength);
    this.offset += data.byteLength;
    return data;
  }

  closeFile(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const handleId = this.handleId;
    this.handleId = null;
    if (!handleId) {
      return;
    }

    void api.trzszCloseUploadFile(this.ownerId, handleId).catch(() => {
      // Best-effort cleanup on controller disposal or transfer failure.
    });
  }

  private async ensureHandle(): Promise<string> {
    if (this.handleId) {
      return this.handleId;
    }

    const handle = await api.trzszOpenUploadFile(this.ownerId, this.entry.path);
    this.handleId = handle.handleId;
    return handle.handleId;
  }
}

export async function buildTauriFileReaders(
  ownerId: string,
  paths: string[] | undefined,
  allowDirectory: boolean,
): Promise<TrzszFileReader[] | undefined> {
  if (!paths || paths.length === 0) {
    return undefined;
  }

  const entries = await api.trzszBuildUploadEntries(ownerId, paths, allowDirectory);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map((entry) => new TauriFileReader(ownerId, entry));
}