import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMutableSelectorStore } from '@/test/helpers/mockStore';

const apiMocks = vi.hoisted(() => ({
  treeDrillDown: vi.fn(),
  connectTreeNode: vi.fn(),
}));

const sessionTreeState = vi.hoisted(() => ({
  fetchTree: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/store/sessionTreeStore', () => ({
  useSessionTreeStore: createMutableSelectorStore(sessionTreeState),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'modals.drill_down.description' && options?.host) {
        return `connect from <host>${String(options.host)}</host>`;
      }
      return key;
    },
  }),
}));

import { DrillDownDialog } from '@/components/modals/DrillDownDialog';

describe('DrillDownDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionTreeState.fetchTree.mockResolvedValue(undefined);
    apiMocks.treeDrillDown.mockResolvedValue('node-child');
    apiMocks.connectTreeNode.mockResolvedValue({
      nodeId: 'node-child',
      sshConnectionId: 'ssh-child',
    });
  });

  it('submits agentForwarding when enabled', async () => {
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <DrillDownDialog
        parentNodeId="parent-1"
        parentHost="parent.example.com"
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText('modals.drill_down.target_host *'), {
      target: { value: 'child.example.com' },
    });
    fireEvent.change(screen.getByLabelText('modals.drill_down.username *'), {
      target: { value: 'alice' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'modals.new_connection.agent_forwarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'modals.drill_down.connect' }));

    await waitFor(() => {
      expect(apiMocks.treeDrillDown).toHaveBeenCalledWith(
        expect.objectContaining({
          parentNodeId: 'parent-1',
          host: 'child.example.com',
          username: 'alice',
          agentForwarding: true,
        }),
      );
    });

    expect(apiMocks.connectTreeNode).toHaveBeenCalledWith({
      nodeId: 'node-child',
      cols: 0,
      rows: 0,
    });
    expect(onSuccess).toHaveBeenCalledWith('node-child', 'ssh-child');
  });
});
