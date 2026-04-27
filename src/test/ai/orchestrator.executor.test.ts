import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTarget } from '@/lib/ai/orchestrator';

const getAiTargetMock = vi.hoisted(() => vi.fn());
const listAiTargetsMock = vi.hoisted(() => vi.fn());
const runCommandOnTargetMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/capabilities/targets', () => ({
  getAiTarget: getAiTargetMock,
  listAiTargets: listAiTargetsMock,
}));

vi.mock('@/lib/ai/capabilities/connections', () => ({
  connectAiTarget: vi.fn(),
}));

vi.mock('@/lib/ai/capabilities/terminal', () => ({
  observeTerminalTarget: vi.fn(),
  runCommandOnTarget: runCommandOnTargetMock,
  sendTerminalInput: vi.fn(),
}));

vi.mock('@/lib/ai/capabilities/resources', () => ({
  getState: vi.fn(),
  openAppSurface: vi.fn(),
  readResource: vi.fn(),
  selectAiTarget: vi.fn(),
  transferResource: vi.fn(),
  writeResource: vi.fn(),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { ai: { memory: { enabled: true, content: '' } } },
      updateAi: vi.fn(),
    }),
  },
}));

import { executeOrchestratorTool } from '@/lib/ai/orchestrator';

describe('orchestrator executor target consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns connect_target recovery when run_command targets a stale ssh-node', async () => {
    const staleTarget: AiTarget = {
      id: 'ssh-node:node-1',
      kind: 'ssh-node',
      label: 'prod.example.com',
      state: 'stale',
      capabilities: ['command.run', 'state.list'],
      refs: { nodeId: 'node-1', connectionId: 'old-runtime-connection' },
      metadata: { host: 'prod.example.com' },
    };
    getAiTargetMock.mockResolvedValue(staleTarget);

    const result = await executeOrchestratorTool(
      'run_command',
      { target_id: 'ssh-node:node-1', command: 'pwd' },
      {},
      'tool-1',
    );

    expect(result.success).toBe(false);
    expect(runCommandOnTargetMock).not.toHaveBeenCalled();
    expect(result.envelope?.error).toMatchObject({
      code: 'target_not_ready',
      recoverable: true,
    });
    expect(result.envelope?.nextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tool: 'connect_target',
        args: { target_id: 'ssh-node:node-1' },
      }),
    ]));
  });
});
