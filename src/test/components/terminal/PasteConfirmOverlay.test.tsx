import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'terminal.paste.title') {
        return `paste ${String(options?.count ?? 0)}`;
      }
      if (key === 'terminal.paste.more_lines') {
        return `more ${String(options?.count ?? 0)}`;
      }
      return key;
    },
  }),
}));

import { PasteConfirmOverlay } from '@/components/terminal/PasteConfirmOverlay';

describe('PasteConfirmOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('confirms and cancels from keyboard shortcuts', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <PasteConfirmOverlay content={'line 1\nline 2'} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('wires action buttons to confirm and cancel handlers', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <PasteConfirmOverlay content={'alpha\nbeta\ngamma'} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'terminal.paste.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'terminal.paste.paste' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
