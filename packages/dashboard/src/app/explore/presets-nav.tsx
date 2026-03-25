'use client';

import { useRouter } from 'next/navigation';
import { SmartPresets } from '@/components/smart-presets';
import { presets, type Preset } from '@/lib/presets';

interface PresetsNavProps {
  matchCounts: Record<string, number>;
}

export function PresetsNav({ matchCounts }: PresetsNavProps) {
  const router = useRouter();

  function handleSelect(preset: Preset) {
    router.push(`/rankings?preset=${preset.id}`);
  }

  return (
    <SmartPresets
      activePreset={null}
      onSelectPreset={handleSelect}
      matchCounts={matchCounts}
    />
  );
}
