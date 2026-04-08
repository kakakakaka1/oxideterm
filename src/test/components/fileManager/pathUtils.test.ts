import { describe, expect, it } from 'vitest';
import {
  detectLocalPathStyle,
  getLocalBaseName,
  getLocalParentPath,
  isWindowsDriveRoot,
  isWindowsUncRoot,
  joinLocalPath,
  normalizeLocalPath,
  validateLocalFileName,
} from '@/components/fileManager/pathUtils';

describe('fileManager pathUtils', () => {
  it('normalizes Windows drive paths and preserves the root slash', () => {
    expect(normalizeLocalPath('c:/Users/test/')).toBe('C:\\Users\\test');
    expect(normalizeLocalPath('C:')).toBe('C:\\');
  });

  it('preserves UNC prefixes while collapsing duplicate separators', () => {
    const uncPath = '\\\\server//share' + '\\' + 'folder' + '\\';
    expect(normalizeLocalPath(uncPath)).toBe('\\\\server\\share\\folder');
    expect(isWindowsUncRoot('\\\\server\\share')).toBe(true);
  });

  it('joins Windows and POSIX paths without mixing separators', () => {
    expect(joinLocalPath('C:\\Users\\test', 'notes.txt')).toBe('C:\\Users\\test\\notes.txt');
    expect(joinLocalPath('C:\\', 'notes.txt')).toBe('C:\\notes.txt');
    expect(joinLocalPath('/home/test', 'notes.txt')).toBe('/home/test/notes.txt');
  });

  it('resolves parent paths across Windows roots, UNC shares, and POSIX roots', () => {
    expect(getLocalParentPath('C:\\Users\\test')).toBe('C:\\Users');
    expect(getLocalParentPath('C:\\')).toBe('__DRIVES__');
    expect(getLocalParentPath('\\\\server\\share\\folder')).toBe('\\\\server\\share');
    expect(getLocalParentPath('\\\\server\\share')).toBe('\\\\server\\share');
    expect(getLocalParentPath('/home/test')).toBe('/home');
    expect(getLocalParentPath('/')).toBe('/');
  });

  it('extracts base names correctly on Windows and POSIX', () => {
    expect(getLocalBaseName('C:\\Users\\test\\notes.txt')).toBe('notes.txt');
    expect(getLocalBaseName('\\\\server\\share\\folder')).toBe('folder');
    expect(getLocalBaseName('/home/test')).toBe('test');
  });

  it('detects Windows path styles and drive roots', () => {
    expect(detectLocalPathStyle('D:\\Projects')).toBe('windows');
    expect(detectLocalPathStyle('\\\\server\\share')).toBe('windows');
    expect(detectLocalPathStyle('/var/tmp')).toBe('posix');
    expect(isWindowsDriveRoot('D:\\')).toBe(true);
  });

  it('rejects invalid local file names but keeps valid unicode names', () => {
    expect(validateLocalFileName('日本語.txt')).toBeNull();
    expect(validateLocalFileName('bad/name')).toBe('ide.validation.nameContainsSlash');
    expect(validateLocalFileName('bad\\name')).toBe('ide.validation.nameContainsSlash');
    expect(validateLocalFileName('bad*name')).toBe('ide.validation.nameInvalidChars');
    expect(validateLocalFileName('..')).toBe('ide.validation.nameInvalid');
  });
});