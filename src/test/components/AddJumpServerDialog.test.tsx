import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { AddJumpServerDialog } from '@/components/modals/AddJumpServerDialog';

describe('AddJumpServerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits agentForwarding when enabled', () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(<AddJumpServerDialog open onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByLabelText('modals.jump_server.host *'), {
      target: { value: 'jump.example.com' },
    });
    fireEvent.change(screen.getByLabelText('modals.jump_server.username *'), {
      target: { value: 'alice' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'modals.new_connection.agent_forwarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'modals.jump_server.add' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'jump.example.com',
        username: 'alice',
        agentForwarding: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});