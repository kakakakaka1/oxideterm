import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@/lib/markdownRenderer', () => ({
  markdownStyles: '',
  renderMarkdown: (content: string) => `<p>${content}</p>`,
  renderMathInElement: vi.fn(),
}));

vi.mock('@/hooks/useMermaid', () => ({
  useMermaid: vi.fn(),
}));

vi.mock('@/components/ai/ThinkingBlock', () => ({
  ThinkingBlock: ({ content }: { content: string }) => <div data-testid="thinking-block">{content}</div>,
}));

vi.mock('@/components/ai/ToolCallBlock', () => ({
  ToolCallBlock: ({ toolRounds }: { toolRounds?: Array<{ id: string }> }) => (
    <div data-testid="tool-call-block">{toolRounds?.length ?? 0}</div>
  ),
}));

vi.mock('@/components/ai/GuardrailBlock', () => ({
  GuardrailBlock: ({ part }: { part: { message: string } }) => <div data-testid="guardrail-block">{part.message}</div>,
}));

vi.mock('@/components/ai/WarningBlock', () => ({
  WarningBlock: ({ part }: { part: { message: string } }) => <div data-testid="warning-block">{part.message}</div>,
}));

import { ChatMessage } from '@/components/ai/ChatMessage';
import type { AiChatMessage } from '@/types';

describe('ChatMessage', () => {
  it('renders assistant messages from turn-first fields before legacy fallbacks', () => {
    const message: AiChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'legacy content',
      thinkingContent: 'legacy thinking',
      timestamp: 1,
      turn: {
        id: 'assistant-1',
        status: 'complete',
        plainTextSummary: 'turn text',
        toolRounds: [
          {
            id: 'round-1',
            round: 1,
            toolCalls: [
              {
                id: 'tool-1',
                name: 'read_file',
                argumentsText: '{"path":"/tmp/demo.txt"}',
                executionState: 'completed',
              },
            ],
          },
        ],
        parts: [
          { type: 'thinking', text: 'turn thinking' },
          { type: 'guardrail', code: 'tool-use-disabled', message: 'guardrail message' },
          { type: 'warning', code: 'tool-budget', message: 'warning message' },
          { type: 'text', text: 'turn text' },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByTestId('thinking-block')).toHaveTextContent('turn thinking');
    expect(screen.getByTestId('guardrail-block')).toHaveTextContent('guardrail message');
    expect(screen.getByTestId('warning-block')).toHaveTextContent('warning message');
    expect(screen.getByTestId('tool-call-block')).toHaveTextContent('1');
    expect(screen.getByText('turn text')).toBeInTheDocument();
    expect(screen.queryByText('legacy content')).not.toBeInTheDocument();
    expect(screen.queryByText('legacy thinking')).not.toBeInTheDocument();
  });

  it('falls back to legacy content when a turn has no text or structured feedback parts', () => {
    const message: AiChatMessage = {
      id: 'assistant-2',
      role: 'assistant',
      content: 'legacy fallback content',
      timestamp: 2,
      turn: {
        id: 'assistant-2',
        status: 'complete',
        plainTextSummary: 'legacy fallback content',
        toolRounds: [],
        parts: [],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByText('legacy fallback content')).toBeInTheDocument();
  });

  it('does not duplicate structured feedback through legacy content fallback', () => {
    const message: AiChatMessage = {
      id: 'assistant-3',
      role: 'assistant',
      content: 'guardrail only',
      timestamp: 3,
      turn: {
        id: 'assistant-3',
        status: 'complete',
        plainTextSummary: 'guardrail only',
        toolRounds: [],
        parts: [
          { type: 'guardrail', code: 'tool-use-disabled', message: 'guardrail only' },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getAllByText('guardrail only')).toHaveLength(1);
  });

  it('shows tool blocks for part-level tool calls before rounds are materialized', () => {
    const message: AiChatMessage = {
      id: 'assistant-4',
      role: 'assistant',
      content: '',
      timestamp: 4,
      turn: {
        id: 'assistant-4',
        status: 'streaming',
        plainTextSummary: '',
        toolRounds: [],
        parts: [
          {
            type: 'tool_call',
            id: 'tool-1',
            name: 'terminal_exec',
            argumentsText: '{"command":"pwd"}',
            status: 'complete',
          },
        ],
      },
    };

    render(<ChatMessage message={message} />);

    expect(screen.getByTestId('tool-call-block')).toHaveTextContent('0');
  });
});