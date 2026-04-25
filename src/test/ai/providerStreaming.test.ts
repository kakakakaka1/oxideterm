import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiFetchStreamingMock = vi.hoisted(() => vi.fn());
const aiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/aiFetch', () => ({
  aiFetch: aiFetchMock,
  aiFetchStreaming: aiFetchStreamingMock,
}));

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectEvents(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

function getLastRequestBody(): Record<string, unknown> {
  const init = aiFetchStreamingMock.mock.calls.at(-1)?.[1];
  return JSON.parse(init.body);
}

describe('provider streaming EOF handling', () => {
  beforeEach(() => {
    aiFetchMock.mockReset();
    aiFetchStreamingMock.mockReset();
  });

  it('openai provider processes the final SSE line without a trailing newline', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream([
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
      ]),
    });

    const { openaiProvider } = await import('@/lib/ai/providers/openai');
    const events = await collectEvents(openaiProvider.streamCompletion({
      baseUrl: 'https://example.test',
      model: 'gpt-test',
      apiKey: 'key',
      tools: [],
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(events).toContainEqual({ type: 'content', content: 'hello' });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('openai provider flushes pending tool calls when the stream ends without [DONE]', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\\"path\\":\\"/tmp/a.txt\\"}"}}]}}]}',
      ]),
    });

    const { openaiProvider } = await import('@/lib/ai/providers/openai');
    const events = await collectEvents(openaiProvider.streamCompletion({
      baseUrl: 'https://example.test',
      model: 'gpt-test',
      apiKey: 'key',
      tools: [],
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(events).toContainEqual({
      type: 'tool_call_complete',
      id: 'call-1',
      name: 'read_file',
      arguments: '{"path":"/tmp/a.txt"}',
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('anthropic provider processes the final content block without a trailing newline', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"review text"}}',
      ]),
    });

    const { anthropicProvider } = await import('@/lib/ai/providers/anthropic');
    const events = await collectEvents(anthropicProvider.streamCompletion({
      baseUrl: 'https://example.test',
      model: 'claude-test',
      apiKey: 'key',
      tools: [],
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(events).toContainEqual({ type: 'content', content: 'review text' });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('deepseek provider maps reasoning off to disabled thinking', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream(['data: [DONE]']),
    });

    const { deepseekProvider } = await import('@/lib/ai/providers/openai');
    await collectEvents(deepseekProvider.streamCompletion({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
      apiKey: 'key',
      tools: [],
      reasoningEffort: 'off',
      reasoningProtocol: 'deepseek',
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(getLastRequestBody()).toMatchObject({
      thinking: { type: 'disabled' },
    });
  });

  it('deepseek provider maps max reasoning to enabled thinking', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream(['data: [DONE]']),
    });

    const { deepseekProvider } = await import('@/lib/ai/providers/openai');
    await collectEvents(deepseekProvider.streamCompletion({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
      apiKey: 'key',
      tools: [],
      reasoningEffort: 'max',
      reasoningProtocol: 'deepseek',
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(getLastRequestBody()).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
  });

  it('deepseek provider preserves reasoning only for the active tool sub-turn', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream(['data: [DONE]']),
    });

    const { deepseekProvider } = await import('@/lib/ai/providers/openai');
    await collectEvents(deepseekProvider.streamCompletion({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      apiKey: 'key',
      tools: [],
      reasoningEffort: 'max',
      reasoningProtocol: 'deepseek',
    }, [
      { role: 'user', content: 'old question' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'old reasoning',
        tool_calls: [{ id: 'old-call', name: 'read_file', arguments: '{}' }],
      },
      { role: 'user', content: 'current question' },
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'current reasoning',
        tool_calls: [{ id: 'new-call', name: 'read_file', arguments: '{}' }],
      },
      { role: 'tool', content: 'tool result', tool_call_id: 'new-call' },
    ], new AbortController().signal));

    const messages = getLastRequestBody().messages as Array<Record<string, unknown>>;
    expect(messages[1]).not.toHaveProperty('reasoning_content');
    expect(messages[3]).toMatchObject({ reasoning_content: 'current reasoning' });
  });

  it('anthropic provider maps high reasoning to a thinking budget', async () => {
    aiFetchStreamingMock.mockReturnValue({
      response: Promise.resolve({ ok: true, status: 200 }),
      body: makeStream(['data: {"type":"message_stop"}']),
    });

    const { anthropicProvider } = await import('@/lib/ai/providers/anthropic');
    await collectEvents(anthropicProvider.streamCompletion({
      baseUrl: 'https://example.test',
      model: 'claude-test',
      apiKey: 'key',
      tools: [],
      maxResponseTokens: 8192,
      reasoningEffort: 'high',
      reasoningProtocol: 'anthropic',
    }, [{ role: 'user', content: 'hi' }], new AbortController().signal));

    expect(getLastRequestBody()).toMatchObject({
      thinking: { type: 'enabled', budget_tokens: 4096 },
    });
  });
});
