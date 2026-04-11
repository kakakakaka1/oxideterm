export function normalizePluginRelativePath(relativePath: string): string {
  let normalized = relativePath.replace(/\\/g, '/');

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized.replace(/^\/+/, '');
}