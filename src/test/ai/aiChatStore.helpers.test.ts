import { describe, expect, it } from 'vitest';

import { dtoToConversation, encodeAnchorContent, hydrateStructuredConversation, rebuildConversationFromTranscript } from '@/store/aiChatStore.helpers';
import type { AiConversation } from '@/types';

describe('hydrateStructuredConversation', () => {
  it('preserves existing turn identity and pending summaries while rebuilding assistant projections', () => {
    const conversation: AiConversation = {
      id: 'conv-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 1,
      origin: 'sidebar',
      sessionMetadata: {
        conversationId: 'conv-1',
        firstUserMessage: 'hello',
      },
      messages: [
        { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'world',
          thinkingContent: 'thinking',
          timestamp: 2,
        },
      ],
      turns: [
        {
          id: 'turn-existing',
          requestMessageId: 'user-1',
          requestText: 'hello',
          startedAt: 1,
          status: 'streaming',
          rounds: [
            {
              id: 'round-1',
              round: 1,
              retryCount: 2,
              summary: 'existing summary',
              toolCalls: [],
            },
          ],
          pendingSummaries: [{ roundId: 'round-1', text: 'pending' }],
        },
      ],
    };

    const hydrated = hydrateStructuredConversation(conversation);

    expect(hydrated.turns).toEqual([
      expect.objectContaining({
        id: 'turn-existing',
        requestMessageId: 'user-1',
        rounds: [expect.objectContaining({ id: 'round-1', retryCount: 2, summary: 'pending', summaryMetadata: undefined })],
        pendingSummaries: [],
      }),
    ]);
    expect(hydrated.messages[1].turn).toEqual(expect.objectContaining({
      id: 'assistant-1',
      status: 'complete',
      toolRounds: [expect.objectContaining({ id: 'round-1', summary: 'pending' })],
    }));
    expect(hydrated.messages[1].transcriptRef).toEqual({
      conversationId: 'conv-1',
      startEntryId: 'user-1',
      endEntryId: 'assistant-1',
    });
  });

  it('rebuilds stale assistant projection fields from transcript entries', () => {
    const conversation = dtoToConversation({
      id: 'conv-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 2,
      sessionId: null,
      origin: 'sidebar',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'How do I fix this?',
          timestamp: 10,
          context: null,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'stale projection',
          timestamp: 11,
          context: null,
        },
      ],
    });

    const rebuilt = rebuildConversationFromTranscript(conversation, [
      {
        id: 'entry-user',
        conversationId: 'conv-1',
        timestamp: 10,
        kind: 'user_message',
        payload: {
          messageId: 'user-1',
          content: 'How do I fix this?',
        },
      },
      {
        id: 'entry-start',
        conversationId: 'conv-1',
        turnId: 'assistant-1',
        timestamp: 11,
        kind: 'assistant_turn_start',
        payload: {
          messageId: 'assistant-1',
        },
      },
      {
        id: 'entry-part',
        conversationId: 'conv-1',
        turnId: 'assistant-1',
        timestamp: 12,
        kind: 'assistant_part',
        payload: {
          parts: [
            { type: 'thinking', text: 'inspect logs' },
            { type: 'text', text: 'Fresh answer' },
          ],
        },
      },
      {
        id: 'entry-end',
        conversationId: 'conv-1',
        turnId: 'assistant-1',
        timestamp: 13,
        kind: 'assistant_turn_end',
        payload: {
          messageId: 'assistant-1',
          status: 'complete',
          plainTextSummary: 'Fresh answer',
        },
      },
    ]);

    expect(rebuilt.messages[1]).toMatchObject({
      id: 'assistant-1',
      content: 'Fresh answer',
      thinkingContent: 'inspect logs',
      transcriptRef: {
        conversationId: 'conv-1',
        startEntryId: 'entry-start',
        endEntryId: 'entry-end',
      },
    });
  });

  it('reconstructs a compacted projection from transcript when persisted messages are missing', () => {
    const rebuilt = rebuildConversationFromTranscript(dtoToConversation({
      id: 'conv-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 2,
      sessionId: null,
      origin: 'sidebar',
      messages: [],
    }), [
      {
        id: 'entry-user-old',
        conversationId: 'conv-1',
        timestamp: 10,
        kind: 'user_message',
        payload: {
          messageId: 'user-old',
          content: 'Old question',
        },
      },
      {
        id: 'entry-summary',
        conversationId: 'conv-1',
        timestamp: 20,
        kind: 'summary_created',
        payload: {
          messageId: 'anchor-1',
          summaryText: 'Condensed history',
          compactedMessageCount: 2,
          compactedUntilMessageId: 'assistant-old',
        },
      },
      {
        id: 'entry-user-new',
        conversationId: 'conv-1',
        timestamp: 30,
        kind: 'user_message',
        payload: {
          messageId: 'user-new',
          content: 'Latest question',
        },
      },
    ]);

    expect(rebuilt.messages).toHaveLength(2);
    expect(rebuilt.messages[0]).toMatchObject({
      id: 'anchor-1',
      role: 'system',
      content: 'Condensed history',
      transcriptRef: {
        conversationId: 'conv-1',
        endEntryId: 'entry-summary',
      },
      metadata: {
        type: 'compaction-anchor',
        originalCount: 2,
      },
    });
    expect(rebuilt.messages[1]).toMatchObject({
      id: 'user-new',
      role: 'user',
      content: 'Latest question',
    });
  });

  it('does not reinsert compacted transcript-only messages behind an existing anchor projection', () => {
    const conversation = dtoToConversation({
      id: 'conv-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 2,
      sessionId: null,
      origin: 'sidebar',
      messages: [
        {
          id: 'anchor-1',
          role: 'system',
          content: encodeAnchorContent('Condensed history', {
            type: 'compaction-anchor',
            originalCount: 2,
            compactedAt: 20,
          }),
          timestamp: 20,
          context: null,
        },
      ],
    });

    const rebuilt = rebuildConversationFromTranscript(conversation, [
      {
        id: 'entry-user-old',
        conversationId: 'conv-1',
        timestamp: 10,
        kind: 'user_message',
        payload: {
          messageId: 'user-old',
          content: 'Old question',
        },
      },
      {
        id: 'entry-summary',
        conversationId: 'conv-1',
        timestamp: 20,
        kind: 'summary_created',
        payload: {
          messageId: 'anchor-1',
          summaryText: 'Condensed history',
          compactedMessageCount: 2,
          compactedUntilMessageId: 'assistant-old',
        },
      },
      {
        id: 'entry-user-new',
        conversationId: 'conv-1',
        timestamp: 30,
        kind: 'user_message',
        payload: {
          messageId: 'user-new',
          content: 'Latest question',
        },
      },
    ]);

    expect(rebuilt.messages.map((message) => message.id)).toEqual(['anchor-1', 'user-new']);
  });

  it('restores the latest anchor from transcript when the persisted projection lost it', () => {
    const conversation = dtoToConversation({
      id: 'conv-1',
      title: 'Conversation',
      createdAt: 1,
      updatedAt: 2,
      sessionId: null,
      origin: 'sidebar',
      messages: [
        {
          id: 'user-new',
          role: 'user',
          content: 'Latest question',
          timestamp: 30,
          context: null,
        },
      ],
    });

    const rebuilt = rebuildConversationFromTranscript(conversation, [
      {
        id: 'entry-user-old',
        conversationId: 'conv-1',
        timestamp: 10,
        kind: 'user_message',
        payload: {
          messageId: 'user-old',
          content: 'Old question',
        },
      },
      {
        id: 'entry-summary',
        conversationId: 'conv-1',
        timestamp: 20,
        kind: 'summary_created',
        payload: {
          messageId: 'anchor-1',
          summaryText: 'Condensed history',
          compactedMessageCount: 2,
          compactedUntilMessageId: 'assistant-old',
        },
      },
      {
        id: 'entry-user-new',
        conversationId: 'conv-1',
        timestamp: 30,
        kind: 'user_message',
        payload: {
          messageId: 'user-new',
          content: 'Latest question',
        },
      },
    ]);

    expect(rebuilt.messages.map((message) => message.id)).toEqual(['anchor-1', 'user-new']);
    expect(rebuilt.messages[0]).toMatchObject({
      role: 'system',
      content: 'Condensed history',
    });
  });
});