import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  localGetDrives: vi.fn().mockResolvedValue([]),
  localListDir: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@tauri-apps/api/path', () => ({ homeDir: vi.fn().mockResolvedValue('/Users/tester') }));

import { mkdir, remove, rename } from '@tauri-apps/plugin-fs';
import { useLocalFiles } from '@/components/fileManager/hooks/useLocalFiles';

describe('useLocalFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.localListDir.mockResolvedValue([]);
    vi.mocked(mkdir).mockResolvedValue(undefined as never);
    vi.mocked(remove).mockResolvedValue(undefined as never);
    vi.mocked(rename).mockResolvedValue(undefined as never);
  });

  it('requests Windows directory listings using normalized paths', async () => {
    apiMocks.localListDir.mockResolvedValue([
      { name: 'notes.txt', path: 'C:\\Users\\tester\\notes.txt', file_type: 'File', size: 0, modified: 0, permissions: '' },
    ]);

    renderHook(() => useLocalFiles({ initialPath: 'C:\\Users\\tester' }));

    await waitFor(() => {
      expect(apiMocks.localListDir).toHaveBeenCalledWith('C:\\Users\\tester');
    });
  });

  it('requests UNC directory listings without corrupting the share prefix', async () => {
    apiMocks.localListDir.mockResolvedValue([
      { name: 'notes.txt', path: '\\\\server\\share\\docs\\notes.txt', file_type: 'File', size: 0, modified: 0, permissions: '' },
    ]);

    renderHook(() => useLocalFiles({ initialPath: '\\\\server\\share\\docs' }));

    await waitFor(() => {
      expect(apiMocks.localListDir).toHaveBeenCalledWith('\\\\server\\share\\docs');
    });
  });

  it('creates, deletes, and renames using the normalized platform path', async () => {
    const { result } = renderHook(() => useLocalFiles({ initialPath: 'C:\\Users\\tester' }));

    await act(async () => {
      await result.current.createFolder('docs');
      await result.current.deleteFiles(['docs']);
      await result.current.renameFile('old.txt', 'new.txt');
    });

    expect(mkdir).toHaveBeenCalledWith('C:\\Users\\tester\\docs');
    expect(remove).toHaveBeenCalledWith('C:\\Users\\tester\\docs', { recursive: true });
    expect(rename).toHaveBeenCalledWith('C:\\Users\\tester\\old.txt', 'C:\\Users\\tester\\new.txt');
  });

  it('ignores stale permission errors after navigating away to a new directory', async () => {
    let rejectLocked: ((reason?: unknown) => void) | undefined;
    const lockedPromise = new Promise<never>((_, reject) => {
      rejectLocked = reject;
    });

    apiMocks.localListDir.mockImplementation((targetPath: string) => {
      const resolvedPath = String(targetPath);
      if (resolvedPath === 'C:\\locked') {
        return lockedPromise;
      }
      if (resolvedPath === 'C:\\allowed') {
        return Promise.resolve([{ name: 'ok.txt', path: 'C:\\allowed\\ok.txt', file_type: 'File', size: 0, modified: 0, permissions: '' }]);
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useLocalFiles({ initialPath: 'C:\\locked' }));

    act(() => {
      result.current.navigate('C:/allowed');
    });

    await waitFor(() => {
      expect(result.current.path).toBe('C:\\allowed');
      expect(result.current.displayFiles.map(file => file.name)).toEqual(['ok.txt']);
    });

    rejectLocked?.(new Error('Permission denied'));

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.path).toBe('C:\\allowed');
    });
  });
});
