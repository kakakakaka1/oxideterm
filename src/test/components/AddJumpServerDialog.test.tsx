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

  it('submits certificate auth with key and cert paths', () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(<AddJumpServerDialog open onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByLabelText('modals.jump_server.host *'), {
      target: { value: 'jump.example.com' },
    });
    fireEvent.change(screen.getByLabelText('modals.jump_server.username *'), {
      target: { value: 'alice' },
    });
    const certificateTab = screen.getByRole('tab', { name: 'modals.new_connection.auth_certificate' });
    fireEvent.mouseDown(certificateTab);
    fireEvent.click(certificateTab);
    fireEvent.change(document.querySelector('#jump-cert-keypath') as HTMLInputElement, {
      target: { value: '/tmp/id_ed25519' },
    });
    fireEvent.change(document.querySelector('#jump-certpath') as HTMLInputElement, {
      target: { value: '/tmp/id_ed25519-cert.pub' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'modals.jump_server.add' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'jump.example.com',
        username: 'alice',
        authType: 'certificate',
        keyPath: '/tmp/id_ed25519',
        certPath: '/tmp/id_ed25519-cert.pub',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});