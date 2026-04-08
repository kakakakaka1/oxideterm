import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFile, mkdir, readDir, rename } from '@tauri-apps/plugin-fs';
import { useFileClipboard } from '@/components/fileManager/hooks/useFileClipboard';
import type { FileInfo } from '@/components/fileManager/types';

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    name: 'report.txt',
    path: 'C:\\src\\report.txt',
    file_type: 'File',
    size: 12,
    modified: 0,
    permissions: '',
    ...overrides,
  };
}

describe('useFileClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyFile).mockResolvedValue(undefined as never);
    vi.mocked(rename).mockResolvedValue(undefined as never);
    vi.mocked(mkdir).mockResolvedValue(undefined as never);
    vi.mocked(readDir).mockResolvedValue([] as never);
  });

  it('copies a Windows file without mixing path separators', async () => {
    const { result } = renderHook(() => useFileClipboard());

    act(() => {
      result.current.copy([makeFile()], 'C:\\src');
    });

    await act(async () => {
      await result.current.paste('D:\\dest');
    });

    expect(copyFile).toHaveBeenCalledWith('C:\\src\\report.txt', 'D:\\dest\\report.txt');
  });

  it('recursively copies Windows directories using normalized child paths', async () => {
    const directory = makeFile({ name: 'folder', path: 'C:\\src\\folder', file_type: 'Directory' });
    vi.mocked(readDir).mockImplementation(async (path: string) => {
      if (path === 'C:\\src\\folder') {
        return [{ name: 'nested.txt', isDirectory: false }] as never;
      }
      return [] as never;
    });

    const { result } = renderHook(() => useFileClipboard());

    act(() => {
      result.current.copy([directory], 'C:\\src');
    });

    await act(async () => {
      await result.current.paste('D:\\dest');
    });

    expect(mkdir).toHaveBeenCalledWith('D:\\dest\\folder', { recursive: true });
    expect(copyFile).toHaveBeenCalledWith('C:\\src\\folder\\nested.txt', 'D:\\dest\\folder\\nested.txt');
  });

  it('treats symlinked directories as leaf entries to avoid recursive loops', async () => {
    const directory = makeFile({ name: 'folder', path: 'C:\\src\\folder', file_type: 'Directory' });
    vi.mocked(readDir).mockImplementation(async (path: string) => {
      if (path === 'C:\\src\\folder') {
        return [{ name: 'linked-dir', isDirectory: true, isSymlink: true }] as never;
      }
      return [] as never;
    });

    const { result } = renderHook(() => useFileClipboard());

    act(() => {
      result.current.copy([directory], 'C:\\src');
    });

    await act(async () => {
      await result.current.paste('D:\\dest');
    });

    expect(readDir).toHaveBeenCalledTimes(2);
    expect(copyFile).toHaveBeenCalledWith('C:\\src\\folder\\linked-dir', 'D:\\dest\\folder\\linked-dir');
  });

  it('treats cut+paste in the same directory as a no-op and clears the clipboard', async () => {
    const { result } = renderHook(() => useFileClipboard());

    act(() => {
      result.current.cut([makeFile()], 'C:\\src');
    });

    await act(async () => {
      await result.current.paste('C:\\src');
    });

    expect(rename).not.toHaveBeenCalled();
    expect(result.current.hasClipboard).toBe(false);
    expect(result.current.clipboardMode).toBeNull();
  });
});