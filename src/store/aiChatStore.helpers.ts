import { parseSuggestions } from '../lib/ai/suggestionParser';
import type { ChatMessage as ProviderChatMessage } from '../lib/ai/providers';
import type { AiConversation, AiChatMessage, AiToolCall } from '../types';

export interface FullConversationDto {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sessionId: string | null;
  origin?: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    toolCalls?: AiToolCall[];
    context: string | null;
  }>;
}

interface ParsedResponse {
  content: string;
  thinkingContent?: string;
}

const ANCHOR_META_HEADER = '$$ANCHOR_B64$$';
const CONDENSE_KEEP_RECENT = 5;
const CONDENSE_SUMMARY_MAX = 300;

export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\n/g, ' ').trim();
  return cleaned.length > 30 ? cleaned.slice(0, 30) + '...' : cleaned;
}

export function dtoToConversation(dto: FullConversationDto): AiConversation {
  return {
    id: dto.id,
    title: dto.title,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    sessionId: dto.sessionId ?? undefined,
    origin: dto.origin || 'sidebar',
    messages: dto.messages.map((m) => {
      if (m.role === 'assistant') {
        let content = m.content;
        let thinkingContent: string | undefined;
        if (content.includes('<thinking>')) {
          const parsed = parseThinkingContent(content);
          content = parsed.content;
          thinkingContent = parsed.thinkingContent;
        }
        const sugResult = parseSuggestions(content);
        return {
          id: m.id,
          role: m.role as 'assistant',
          content: sugResult.cleanContent,
          thinkingContent,
          toolCalls: m.toolCalls,
          timestamp: m.timestamp,
          context: m.context || undefined,
          ...(sugResult.suggestions.length > 0 ? { suggestions: sugResult.suggestions } : {}),
        };
      }

      if (m.role === 'system') {
        const anchor = decodeAnchorContent(m.content);
        if (anchor) {
          return {
            id: m.id,
            role: m.role as 'system',
            content: anchor.content,
            timestamp: m.timestamp,
            context: m.context || undefined,
            metadata: anchor.metadata,
          };
        }
      }

      return {
        id: m.id,
        role: m.role as AiChatMessage['role'],
        content: m.content,
        toolCalls: m.toolCalls,
        timestamp: m.timestamp,
        context: m.context || undefined,
      };
    }),
  };
}

export function parseThinkingContent(rawContent: string): ParsedResponse {
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
  let thinkingContent = '';
  let content = rawContent;

  let match;
  while ((match = thinkingRegex.exec(rawContent)) !== null) {
    if (thinkingContent) thinkingContent += '\n\n';
    thinkingContent += match[1].trim();
  }

  if (thinkingContent) {
    content = rawContent.replace(thinkingRegex, '').trim();
  }

  return {
    content,
    thinkingContent: thinkingContent || undefined,
  };
}

export function encodeAnchorContent(content: string, metadata: NonNullable<AiChatMessage['metadata']>): string {
  const metaJson = JSON.stringify(metadata);
  const b64 = btoa(unescape(encodeURIComponent(metaJson)));
  return `${ANCHOR_META_HEADER}${b64}\n${content}`;
}

export function decodeAnchorContent(content: string): { content: string; metadata: NonNullable<AiChatMessage['metadata']> } | null {
  if (!content.startsWith(ANCHOR_META_HEADER)) return null;
  const newlineIdx = content.indexOf('\n');
  if (newlineIdx === -1) return null;
  try {
    const b64 = content.slice(ANCHOR_META_HEADER.length, newlineIdx);
    const jsonStr = decodeURIComponent(escape(atob(b64)));
    const metadata = JSON.parse(jsonStr);
    const realContent = content.slice(newlineIdx + 1);
    return { content: realContent, metadata };
  } catch {
    return null;
  }
}

type ChatCompletionMessage = ProviderChatMessage;

export function condenseToolMessages(apiMessages: ChatCompletionMessage[]): void {
  const toolIndices: number[] = [];
  for (let i = 0; i < apiMessages.length; i++) {
    if (apiMessages[i].role === 'tool') {
      toolIndices.push(i);
    }
  }

  if (toolIndices.length <= CONDENSE_KEEP_RECENT) return;

  const toCondense = toolIndices.slice(0, -CONDENSE_KEEP_RECENT);
  for (const idx of toCondense) {
    const msg = apiMessages[idx];
    const content = msg.content;
    const toolName = msg.tool_name || 'tool';

    if (content.startsWith('[condensed]')) continue;

    let isError = false;
    try {
      const parsed = JSON.parse(content);
      isError = typeof parsed === 'object' && parsed !== null && 'error' in parsed && !!parsed.error;
    } catch {
      // Plain-text success output.
    }

    if (isError) continue;

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    let summary: string;
    if (lines.length <= 4) {
      summary = lines.join('\n');
    } else {
      const head = lines.slice(0, 2).join('\n');
      const tail = lines.slice(-2).join('\n');
      summary = `${head}\n... (${lines.length - 4} lines omitted)\n${tail}`;
    }

    if (summary.length > CONDENSE_SUMMARY_MAX) {
      summary = summary.slice(0, CONDENSE_SUMMARY_MAX) + '…';
    }

    msg.content = `[condensed] ${toolName} → ok:\n${summary}`;
  }
}