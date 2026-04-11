import { describe, expect, it } from 'vitest';

import { normalizePluginRelativePath } from '@/lib/plugin/pluginPaths';

describe('normalizePluginRelativePath', () => {
  it('strips leading dot segments', () => {
    expect(normalizePluginRelativePath('./src/main.js')).toBe('src/main.js');
    expect(normalizePluginRelativePath('././styles/main.css')).toBe('styles/main.css');
  });

  it('normalizes windows separators', () => {
    expect(normalizePluginRelativePath('.\\src\\main.js')).toBe('src/main.js');
    expect(normalizePluginRelativePath('locales\\zh-CN.json')).toBe('locales/zh-CN.json');
  });

  it('removes accidental leading slashes after normalization', () => {
    expect(normalizePluginRelativePath('/src/main.js')).toBe('src/main.js');
    expect(normalizePluginRelativePath('\\src\\main.js')).toBe('src/main.js');
  });
});