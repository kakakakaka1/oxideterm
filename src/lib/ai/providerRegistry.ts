// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * AI Provider Registry
 *
 * Central registry that maps provider types to their implementations.
 * Used by aiChatStore to resolve the correct streaming adapter.
 */

import type { AiProviderType } from '../../types';
import type { AiReasoningProtocol, AiStreamProvider } from './providers';
import { openaiProvider, openaiCompatibleProvider, deepseekProvider } from './providers/openai';
import { anthropicProvider } from './providers/anthropic';
import { geminiProvider } from './providers/gemini';
import { ollamaProvider } from './providers/ollama';

// ═══════════════════════════════════════════════════════════════════════════
// Provider Registry
// ═══════════════════════════════════════════════════════════════════════════

const providers = new Map<AiProviderType, AiStreamProvider>([
  ['openai', openaiProvider],
  ['openai_compatible', openaiCompatibleProvider],
  ['deepseek', deepseekProvider],
  ['anthropic', anthropicProvider],
  ['gemini', geminiProvider],
  ['ollama', ollamaProvider],
]);

/**
 * Get a provider implementation by type.
 * Falls back to OpenAI-compatible if type is unknown.
 */
export function getProvider(type: AiProviderType): AiStreamProvider {
  return providers.get(type) ?? openaiCompatibleProvider;
}

/**
 * Get all registered provider types
 */
export function getRegisteredProviderTypes(): AiProviderType[] {
  return Array.from(providers.keys());
}

export function getProviderReasoningProtocol(type: AiProviderType): AiReasoningProtocol {
  switch (type) {
    case 'openai':
      return 'openai';
    case 'deepseek':
      return 'deepseek';
    case 'anthropic':
      return 'anthropic';
    default:
      return 'none';
  }
}
