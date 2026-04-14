// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { memo } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

import type { AiTurnPart } from '../../lib/ai/turnModel/types';
import { cn } from '../../lib/utils';

interface WarningBlockProps {
  part: Extract<AiTurnPart, { type: 'warning' | 'error' }>;
}

function getTone(part: WarningBlockProps['part']): string {
  if (part.type === 'error') {
    return 'border-red-500/25 bg-red-500/8 text-red-100';
  }

  return 'border-yellow-500/25 bg-yellow-500/8 text-yellow-100';
}

export const WarningBlock = memo(function WarningBlock({ part }: WarningBlockProps) {
  const Icon = part.type === 'error' ? AlertCircle : AlertTriangle;

  return (
    <div className={cn('rounded-md border px-3 py-2', getTone(part))}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed">
          {part.message}
        </div>
      </div>
    </div>
  );
});