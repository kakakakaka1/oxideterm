import { describe, expect, it, vi } from 'vitest';
import {
  buildExternalUploadCandidates,
  cleanupPreviewResource,
  findTransferForProgressEvent,
  getSftpPaneTargetFromPhysicalPosition,
  getTransferCompletionRefreshPlan,
  normalizeSftpTransferPath,
  parseSftpInternalDragDropData,
} from '@/components/sftp/sftpViewHelpers';
import type { TransferItem } from '@/store/transferStore';

function makeTransfer(overrides: Partial<TransferItem> = {}): TransferItem {
  return {
    id: 'tx-1',
    nodeId: 'node-1',
    name: 'file.txt',
    localPath: '/local/file.txt',
    remotePath: '/remote/file.txt',
    direction: 'download',
    size: 10,
    transferred: 0,
    state: 'pending',
    startTime: Date.now(),
    ...overrides,
  };
}

describe('sftpViewHelpers', () => {
  it('normalizes repeated separators and preserves root paths', () => {
    expect(normalizeSftpTransferPath('/foo//bar/')).toBe('/foo/bar');
    expect(normalizeSftpTransferPath('/')).toBe('/');
  });

  it('parses valid internal drag payloads and ignores invalid drops', () => {
    expect(parseSftpInternalDragDropData(JSON.stringify({
      files: ['a.txt', 'b.txt'],
      source: 'local',
      basePath: '/tmp',
    }))).toEqual({
      files: ['a.txt', 'b.txt'],
      source: 'local',
      basePath: '/tmp',
    });

    expect(parseSftpInternalDragDropData('')).toBeNull();
    expect(parseSftpInternalDragDropData('{bad json')).toBeNull();
    expect(parseSftpInternalDragDropData(JSON.stringify({ files: [], source: 'remote', basePath: '/' }))).toBeNull();
  });

  it('maps physical drop positions onto the correct pane', () => {
    expect(getSftpPaneTargetFromPhysicalPosition(
      { x: 900, y: 120 },
      {
        local: { left: 0, right: 300, top: 0, bottom: 400 },
        remote: { left: 301, right: 600, top: 0, bottom: 400 },
      },
      2,
    )).toBe('remote');

    expect(getSftpPaneTargetFromPhysicalPosition(
      { x: 120, y: 120 },
      {
        local: { left: 0, right: 300, top: 0, bottom: 400 },
        remote: { left: 301, right: 600, top: 0, bottom: 400 },
      },
    )).toBe('local');

    expect(getSftpPaneTargetFromPhysicalPosition(
      { x: 1000, y: 1000 },
      {
        local: { left: 0, right: 300, top: 0, bottom: 400 },
        remote: { left: 301, right: 600, top: 0, bottom: 400 },
      },
    )).toBeNull();
  });

  it('builds upload candidates from dropped local paths and deduplicates them', async () => {
    const statPath = vi.fn(async (path: string) => ({
      isDirectory: path.endsWith('photos'),
      isSymlink: false,
      size: path.endsWith('photos') ? 0 : 128,
      mtime: new Date('2026-04-21T00:00:00Z'),
    }));

    await expect(buildExternalUploadCandidates([
      '/tmp/report.txt',
      '/tmp/report.txt/',
      'C:\\Users\\dom\\photos',
    ], statPath)).resolves.toEqual([
      {
        file: 'report.txt',
        sourcePath: '/tmp/report.txt',
        fileInfo: {
          name: 'report.txt',
          path: '/tmp/report.txt',
          file_type: 'File',
          size: 128,
          modified: 1776729600,
          permissions: null,
        },
      },
      {
        file: 'photos',
        sourcePath: 'C:\\Users\\dom\\photos',
        fileInfo: {
          name: 'photos',
          path: 'C:\\Users\\dom\\photos',
          file_type: 'Directory',
          size: 0,
          modified: 1776729600,
          permissions: null,
        },
      },
    ]);
  });

  it('matches transfer progress by exact id first', () => {
    const transfer = makeTransfer();

    const match = findTransferForProgressEvent([transfer], {
      id: 'tx-1',
      local_path: '/other/local.txt',
      remote_path: '/other/remote.txt',
    });

    expect(match?.id).toBe('tx-1');
  });

  it('falls back to exact local and remote path match when id differs', () => {
    const transfer = makeTransfer({ id: 'tx-2' });

    const match = findTransferForProgressEvent([transfer], {
      id: 'backend-id',
      local_path: '/local/file.txt',
      remote_path: '/remote/file.txt',
    });

    expect(match?.id).toBe('tx-2');
  });

  it('does not pick an ambiguous single-path fallback candidate', () => {
    const transfers = [
      makeTransfer({ id: 'tx-1', localPath: '/shared/file.txt', remotePath: '/remote/one.txt' }),
      makeTransfer({ id: 'tx-2', localPath: '/shared/file.txt', remotePath: '/remote/two.txt' }),
    ];

    const match = findTransferForProgressEvent(transfers, {
      id: 'backend-id',
      local_path: '/shared/file.txt',
      remote_path: '/remote/missing.txt',
    });

    expect(match).toBeUndefined();
  });

  it('refreshes only the affected pane when completion direction is known', () => {
    expect(getTransferCompletionRefreshPlan('upload')).toEqual({
      refreshLocal: false,
      refreshRemote: true,
    });
    expect(getTransferCompletionRefreshPlan('download')).toEqual({
      refreshLocal: true,
      refreshRemote: false,
    });
    expect(getTransferCompletionRefreshPlan()).toEqual({
      refreshLocal: true,
      refreshRemote: true,
    });
  });

  it('cleans up preview temp resources when present', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await cleanupPreviewResource({ tempPath: '/tmp/preview.bin' }, cleanup);

    expect(cleanup).toHaveBeenCalledWith('/tmp/preview.bin');
  });

  it('swallows preview cleanup failures so close flows keep working', async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(
      cleanupPreviewResource({ tempPath: '/tmp/preview.bin' }, cleanup),
    ).resolves.toBeUndefined();
  });
});