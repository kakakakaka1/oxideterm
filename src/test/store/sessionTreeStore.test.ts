import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getSessionTree: vi.fn(),
  getTreeNodePath: vi.fn(),
  updateTreeNodeState: vi.fn(),
}));

const settingsStoreMock = vi.hoisted(() => {
  const state = {
    settings: {
      treeUI: {
        expandedIds: [] as string[],
        focusedNodeId: null as string | null,
      },
    },
    setTreeExpanded: vi.fn((ids: string[]) => {
      state.settings.treeUI.expandedIds = ids;
    }),
    setFocusedNode: vi.fn((nodeId: string | null) => {
      state.settings.treeUI.focusedNodeId = nodeId;
    }),
    toggleTreeNode: vi.fn((nodeId: string) => {
      const ids = new Set(state.settings.treeUI.expandedIds);
      if (ids.has(nodeId)) {
        ids.delete(nodeId);
      } else {
        ids.add(nodeId);
      }
      state.settings.treeUI.expandedIds = Array.from(ids);
    }),
  };

  return {
    state,
    store: {
      getState: () => state,
    },
  };
});

const appStoreMock = vi.hoisted(() => {
  const state = {
    sessions: new Map<string, { id: string; connectionId: string }>(),
    refreshConnections: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    store: {
      getState: () => state,
      setState: (updater: unknown) => {
        const patch = typeof updater === 'function' ? updater(state) : updater;
        Object.assign(state, patch);
      },
    },
  };
});

vi.mock('@/lib/api', () => ({
  api: apiMocks,
  nodeSftpInit: vi.fn(),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: settingsStoreMock.store,
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: appStoreMock.store,
}));

vi.mock('@/store/reconnectOrchestratorStore', () => ({
  useReconnectOrchestratorStore: {
    getState: () => ({ scheduleReconnect: vi.fn() }),
  },
}));

vi.mock('@/store/eventLogStore', () => ({
  useEventLogStore: {
    getState: () => ({ addEvent: vi.fn() }),
  },
}));

vi.mock('@/lib/topologyResolver', () => ({
  topologyResolver: {},
}));

import { useSessionTreeStore } from '@/store/sessionTreeStore';
import type { FlatNode } from '@/types';

function makeNode(overrides: Partial<FlatNode> = {}): FlatNode {
  return {
    id: 'node-1',
    parentId: null,
    depth: 0,
    host: 'example.com',
    port: 22,
    username: 'tester',
    displayName: 'Example',
    state: { status: 'pending' },
    hasChildren: false,
    isLastChild: true,
    originType: 'direct',
    terminalSessionId: null,
    sftpSessionId: null,
    sshConnectionId: null,
    ...overrides,
  };
}

const initialMethods = (() => {
  const state = useSessionTreeStore.getState();
  return {
    getNodePath: state.getNodePath,
    resetNodeState: state.resetNodeState,
    connectNodeInternal: state.connectNodeInternal,
    fetchTree: state.fetchTree,
  };
})();

function resetSessionTreeStore() {
  useSessionTreeStore.setState({
    rawNodes: [],
    nodes: [],
    selectedNodeId: null,
    isLoading: false,
    error: null,
    summary: null,
    nodeTerminalMap: new Map(),
    terminalNodeMap: new Map(),
    linkDownNodeIds: new Set(),
    reconnectProgress: new Map(),
    disconnectedTerminalCounts: new Map(),
    connectingNodeIds: new Set(),
    isConnectingChain: false,
    ...initialMethods,
  });
}

describe('sessionTreeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionTreeStore();
    settingsStoreMock.state.settings.treeUI.expandedIds = [];
    settingsStoreMock.state.settings.treeUI.focusedNodeId = null;
    appStoreMock.state.sessions = new Map();
    appStoreMock.state.refreshConnections = vi.fn().mockResolvedValue(undefined);
  });

  it('acquires and releases node and chain locks idempotently', () => {
    const store = useSessionTreeStore.getState();

    expect(store.acquireConnectLock('node-1')).toBe(true);
    expect(store.acquireConnectLock('node-1')).toBe(false);
    expect(store.isNodeConnecting('node-1')).toBe(true);

    store.releaseConnectLock('node-1');
    store.releaseConnectLock('node-1');
    expect(store.isNodeConnecting('node-1')).toBe(false);

    expect(store.acquireChainLock()).toBe(true);
    expect(store.acquireChainLock()).toBe(false);
    store.releaseChainLock();
    store.releaseChainLock();
    expect(useSessionTreeStore.getState().isConnectingChain).toBe(false);
  });

  it('clears inherited link-down flags but preserves descendants with their own broken connection', () => {
    const root = makeNode({ id: 'root', hasChildren: true });
    const inheritedChild = makeNode({ id: 'child-inherited', parentId: 'root', depth: 1 });
    const ownConnectionChild = makeNode({
      id: 'child-own',
      parentId: 'root',
      depth: 1,
      sshConnectionId: 'conn-child',
      state: { status: 'connected' },
    });

    useSessionTreeStore.setState({ rawNodes: [root, inheritedChild, ownConnectionChild] });
    useSessionTreeStore.getState().rebuildUnifiedNodes();

    useSessionTreeStore.getState().markLinkDownBatch(['root', 'child-inherited', 'child-own']);
    useSessionTreeStore.getState().clearLinkDown('root');

    expect(useSessionTreeStore.getState().linkDownNodeIds).toEqual(new Set(['child-own']));
    expect(useSessionTreeStore.getState().getNode('child-own')?.runtime.status).toBe('link-down');
    expect(useSessionTreeStore.getState().getNode('child-inherited')?.runtime.status).toBe('idle');
  });

  it('syncs backend drift, prunes orphan mappings, and repairs appStore session connection ids', async () => {
    const localNode = makeNode({
      id: 'node-1',
      state: { status: 'connected' },
      terminalSessionId: 'term-1',
      sshConnectionId: 'conn-old',
    });
    const orphanNode = makeNode({ id: 'orphan', parentId: 'node-1', depth: 1 });
    const backendNode = makeNode({
      id: 'node-1',
      state: { status: 'connected' },
      terminalSessionId: 'term-1',
      sshConnectionId: 'conn-new',
    });

    useSessionTreeStore.setState({
      rawNodes: [localNode, orphanNode],
      linkDownNodeIds: new Set(['node-1', 'orphan']),
      nodeTerminalMap: new Map([
        ['node-1', ['term-1']],
        ['orphan', ['term-orphan']],
      ]),
      terminalNodeMap: new Map([
        ['term-1', 'node-1'],
        ['term-orphan', 'orphan'],
      ]),
    });
    useSessionTreeStore.getState().rebuildUnifiedNodes();

    appStoreMock.state.sessions = new Map([
      ['term-1', { id: 'term-1', connectionId: 'conn-old' }],
    ]);

    apiMocks.getSessionTree.mockResolvedValue([backendNode]);

    const report = await useSessionTreeStore.getState().syncFromBackend();

    expect(report.driftCount).toBeGreaterThan(0);
    expect(report.fixed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'node-1', field: 'sshConnectionId', backendValue: 'conn-new' }),
        expect.objectContaining({ nodeId: 'orphan', field: 'node', backendValue: null }),
      ]),
    );
    expect(useSessionTreeStore.getState().rawNodes).toEqual([backendNode]);
    expect(useSessionTreeStore.getState().nodeTerminalMap).toEqual(new Map([['node-1', ['term-1']]]));
    expect(useSessionTreeStore.getState().terminalNodeMap).toEqual(new Map([['term-1', 'node-1']]));
    expect(useSessionTreeStore.getState().linkDownNodeIds).toEqual(new Set(['node-1']));
    expect(appStoreMock.state.refreshConnections).toHaveBeenCalledTimes(1);
    expect(appStoreMock.state.sessions.get('term-1')?.connectionId).toBe('conn-new');
  });

  it('releases all locks when connectNodeWithAncestors fails mid-chain', async () => {
    const root = makeNode({
      id: 'root',
      state: { status: 'connected' },
      sshConnectionId: 'conn-root',
      hasChildren: true,
    });
    const leaf = makeNode({ id: 'leaf', parentId: 'root', depth: 1 });
    const resetNodeState = vi.fn().mockResolvedValue(undefined);
    const connectNodeInternal = vi.fn().mockRejectedValue(new Error('boom'));
    const fetchTree = vi.fn().mockResolvedValue(undefined);

    useSessionTreeStore.setState({
      rawNodes: [root, leaf],
      getNodePath: vi.fn().mockResolvedValue([root, leaf]),
      resetNodeState,
      connectNodeInternal,
      fetchTree,
    });
    useSessionTreeStore.getState().rebuildUnifiedNodes();
    apiMocks.updateTreeNodeState.mockResolvedValue(undefined);

    await expect(useSessionTreeStore.getState().connectNodeWithAncestors('leaf')).rejects.toThrow(
      'CONNECTION_CHAIN_FAILED',
    );

    expect(resetNodeState).toHaveBeenCalledTimes(1);
    expect(resetNodeState).toHaveBeenCalledWith('leaf');
    expect(connectNodeInternal).toHaveBeenCalledWith('leaf');
    expect(apiMocks.updateTreeNodeState).toHaveBeenCalledWith('leaf', 'failed', 'boom');
    expect(fetchTree).toHaveBeenCalled();
    expect(useSessionTreeStore.getState().isConnectingChain).toBe(false);
    expect(useSessionTreeStore.getState().connectingNodeIds.size).toBe(0);
  });
});