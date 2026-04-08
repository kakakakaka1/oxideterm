import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  hasAiProviderApiKey: vi.fn(),
  getAiProviderApiKey: vi.fn(),
}));

const streamCompletionMock = vi.hoisted(() => vi.fn());

const appStoreState = vi.hoisted(() => ({
  createTab: vi.fn(),
  sessions: new Map(),
  connections: new Map(),
}));

const settingsState = vi.hoisted(() => ({
  settings: {
    ai: {
      enabled: true,
      activeProviderId: 'provider-1',
      activeModel: '',
      contextMaxChars: 2000,
      providers: [
        {
          id: 'provider-1',
          type: 'openai',
          defaultModel: 'gpt-test',
          baseUrl: 'https://example.test',
        },
      ],
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => settingsState,
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: (selector: (state: typeof appStoreState) => unknown) => selector(appStoreState),
}));

vi.mock('@/lib/api', () => ({
  api: apiMocks,
}));

vi.mock('@/lib/platform', () => ({
  platform: {
    isMac: true,
    isWindows: false,
    isLinux: false,
  },
}));

vi.mock('@/lib/ai/providerRegistry', () => ({
  getProvider: () => ({
    streamCompletion: streamCompletionMock,
  }),
}));

vi.mock('@/components/ai/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

import { AiInlinePanel } from '@/components/terminal/AiInlinePanel';

describe('AiInlinePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.hasAiProviderApiKey.mockResolvedValue(true);
    apiMocks.getAiProviderApiKey.mockResolvedValue('test-key');
  });

  it('extracts a multiline code block and passes it to execute', async () => {
    const onExecute = vi.fn();
    streamCompletionMock.mockImplementation(async function* () {
      yield {
        type: 'content',
        content: '```bash\nmkdir demo\ncd demo\n```',
      };
      yield { type: 'done' };
    });

    render(
      <AiInlinePanel
        isOpen
        onClose={vi.fn()}
        getSelection={() => ''}
        getVisibleBuffer={() => ''}
        onInsert={vi.fn()}
        onExecute={onExecute}
        cursorPosition={null}
        terminalType="terminal"
      />,
    );

    const input = screen.getByPlaceholderText('Ask AI for a command...');
    fireEvent.change(input, { target: { value: 'make a demo workspace' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'terminal.ai.execute' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'terminal.ai.execute' }));

    expect(onExecute).toHaveBeenCalledWith('mkdir demo\ncd demo');
  });

  it('extracts a multiline code block and passes it to insert', async () => {
    const onInsert = vi.fn();
    streamCompletionMock.mockImplementation(async function* () {
      yield {
        type: 'content',
        content: '```bash\nprintf "a"\nprintf "b"\n```',
      };
      yield { type: 'done' };
    });

    render(
      <AiInlinePanel
        isOpen
        onClose={vi.fn()}
        getSelection={() => 'selected text'}
        getVisibleBuffer={() => ''}
        onInsert={onInsert}
        onExecute={vi.fn()}
        cursorPosition={null}
        terminalType="local_terminal"
      />,
    );

    const input = screen.getByPlaceholderText('Asking about selection...');
    fireEvent.change(input, { target: { value: 'rewrite as two commands' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'terminal.ai.insert' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'terminal.ai.insert' }));

    expect(onInsert).toHaveBeenCalledWith('printf "a"\nprintf "b"');
  });
});
