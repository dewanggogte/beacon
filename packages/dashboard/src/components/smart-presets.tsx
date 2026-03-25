'use client';

import { Tooltip } from './tooltip.js';
import { presets, type Preset } from '../lib/presets.js';

interface SmartPresetsProps {
  activePreset: string | null;
  onSelectPreset: (preset: Preset) => void;
  matchCounts?: Record<string, number>;
}

function formatFilterExpression(filters: Preset['filters']): string {
  return filters
    .map((f) => `${f.metric} ${f.operator} ${f.value}`)
    .join(' · ');
}

export function SmartPresets({ activePreset, onSelectPreset, matchCounts }: SmartPresetsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {presets.map((preset) => {
        const isActive = activePreset === preset.id;
        const count = matchCounts?.[preset.id];

        const tooltipContent = (
          <div>
            <div className="font-semibold mb-1">{preset.name}</div>
            <div className="text-text-secondary dark:text-dark-text-secondary mb-2">{preset.description}</div>
            <div className="text-text-muted dark:text-dark-text-muted font-mono text-[10px] leading-relaxed">
              {formatFilterExpression(preset.filters)}
            </div>
          </div>
        );

        return (
          <Tooltip key={preset.id} content={tooltipContent}>
            <button
              onClick={() => onSelectPreset(preset)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-accent-green text-white border-accent-green'
                  : 'border-border dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-accent-green hover:text-accent-green'
              }`}
            >
              {preset.name}
              {count != null && (
                <span className={`ml-1 ${isActive ? 'opacity-80' : 'text-text-muted dark:text-dark-text-muted'}`}>
                  ({count})
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
