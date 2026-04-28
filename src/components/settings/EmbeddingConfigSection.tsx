// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AiSettings } from '@/store/settingsStore';

type EmbeddingConfigSectionProps = {
  ai: AiSettings;
  updateAi: <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => void;
};

export function EmbeddingConfigSection({ ai, updateAi }: EmbeddingConfigSectionProps) {
  const { t } = useTranslation();

  const embeddingProvider = ai.providers.find((provider) => provider.id === ai.embeddingConfig?.providerId);
  const modelPlaceholder = embeddingProvider?.type === 'ollama'
    ? 'nomic-embed-text'
    : 'text-embedding-3-small';

  return (
    <div className="rounded-lg border border-theme-border bg-theme-bg-card p-5">
      <h4 className="text-sm font-medium text-theme-text mb-2 uppercase tracking-wider">
        {t('settings_view.ai.embedding_title')}
      </h4>
      <p className="text-sm text-theme-text-muted mb-4">
        {t('settings_view.ai.embedding_description')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div className="grid gap-1">
          <Label className="text-xs text-theme-text-muted">
            {t('settings_view.ai.embedding_provider')}
          </Label>
          <Select
            value={ai.embeddingConfig?.providerId ?? '__default__'}
            onValueChange={(value) => updateAi('embeddingConfig', {
              ...ai.embeddingConfig,
              providerId: value === '__default__' ? null : value,
              model: ai.embeddingConfig?.model ?? '',
            })}
          >
            <SelectTrigger className="bg-theme-bg h-8 text-xs">
              <SelectValue placeholder={t('settings_view.ai.embedding_provider_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t('settings_view.ai.embedding_provider_default')}
              </SelectItem>
              {ai.providers.filter((provider) => provider.enabled && provider.type !== 'anthropic').map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-theme-text-muted">
            {t('settings_view.ai.embedding_model')}
          </Label>
          <Input
            value={ai.embeddingConfig?.model ?? ''}
            onChange={(event) => updateAi('embeddingConfig', {
              ...ai.embeddingConfig,
              providerId: ai.embeddingConfig?.providerId ?? null,
              model: event.target.value,
            })}
            className="bg-theme-bg h-8 text-xs"
            placeholder={modelPlaceholder}
          />
        </div>
      </div>
    </div>
  );
}
