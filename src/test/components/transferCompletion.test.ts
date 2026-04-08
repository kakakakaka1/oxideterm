import { describe, expect, it } from 'vitest';
import { normalizeTransferFailure, resolveTransferCompletionUpdate } from '@/components/sftp/transferCompletion';

describe('transferCompletion', () => {
  it('returns completed updates for successful completions', () => {
    expect(resolveTransferCompletionUpdate('active', true)).toEqual({ state: 'completed' });
  });

  it('preserves cancelled transfers when a late failure completion arrives', () => {
    expect(resolveTransferCompletionUpdate('cancelled', false, 'late failure')).toBeNull();
  });

  it('returns normalized error updates for non-cancelled failed completions', () => {
    expect(resolveTransferCompletionUpdate('active', false, 'boom')).toEqual({
      state: 'error',
      error: 'boom',
    });
  });

  it('normalizes thrown values into readable messages', () => {
    expect(normalizeTransferFailure(new Error('failed'))).toBe('failed');
    expect(normalizeTransferFailure('plain failure')).toBe('plain failure');
  });
});