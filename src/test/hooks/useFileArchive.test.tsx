import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useFileArchive } from '@/components/fileManager/hooks/useFileArchive';
import type { FileInfo } from '@/components/fileManager/types';

function makeFile(): FileInfo {
  return {
    name: 'report.txt',
    path: 'C:\\src\\report.txt',
    file_type: 'File',
    size: 12,
    modified: 0,
    permissions: '',
  };
}

describe('useFileArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined as never);
  });

  it('builds archive destinations with the correct separator on Windows', async () => {
    const { result } = renderHook(() => useFileArchive());

    await act(async () => {
      await result.current.compress([makeFile()], 'D:\\archives', 'bundle.zip');
    });

    expect(invoke).toHaveBeenCalledWith('compress_files', {
      files: ['C:\\src\\report.txt'],
      archivePath: 'D:\\archives\\bundle.zip',
    });
  });

  it('extract success messages keep the Windows archive basename', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useFileArchive({ onSuccess }));

    await act(async () => {
      await result.current.extract('C:\\archives\\bundle.zip', 'D:\\dest');
    });

    expect(onSuccess).toHaveBeenCalledWith('Extracted bundle.zip');
  });
});