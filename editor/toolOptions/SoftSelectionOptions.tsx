import React from 'react';
import type { SoftSelectionFalloff } from '@/types';
import type { SoftSelectionMode } from '@/engine/engine';
import { Select } from '@/editor/components/ui/Select';
import { ToolSection } from './ToolSection';

const SOFT_SEL_MODES = [
  { label: 'Fixed (Surface)', value: 'FIXED' },
  { label: 'Dynamic (Volume)', value: 'DYNAMIC' },
];

const SOFT_SEL_FALLOFF = [
  { label: 'Volume (Euclidean)', value: 'VOLUME' },
  { label: 'Surface (Geodesic)', value: 'SURFACE' },
];

export const SoftSelectionOptions: React.FC<{
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  radius: number;
  setRadius: (v: number) => void;
  mode: SoftSelectionMode;
  setMode: (v: SoftSelectionMode) => void;
  falloff: SoftSelectionFalloff;
  setFalloff: (v: SoftSelectionFalloff) => void;
  heatmapVisible: boolean;
  setHeatmapVisible: (v: boolean) => void;
}> = ({
  enabled,
  setEnabled,
  radius,
  setRadius,
  mode,
  setMode,
  falloff,
  setFalloff,
  heatmapVisible,
  setHeatmapVisible,
}) => {
  return (
    <ToolSection
      title="Soft Selection"
      icon="Target"
      rightBadge={<span className="text-[9px] text-text-secondary bg-white/5 px-1 rounded">Alt+B</span>}
      className="pt-2 border-t border-white/5"
    >
      <div className="bg-black/20 p-2 rounded border border-white/5 space-y-2">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-xs text-text-primary group-hover:text-white">Enable</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-accent" />
        </label>

        {enabled && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-text-secondary">
                <span>Falloff Radius</span>
                <span>{radius.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={radius}
                onChange={(e) => setRadius(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-text-secondary">Calculation Mode</span>
              <Select value={mode} options={SOFT_SEL_MODES} onChange={(v) => setMode(v as SoftSelectionMode)} className="w-full" />
            </div>

            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-text-secondary">Distance Type</span>
              <Select value={falloff} options={SOFT_SEL_FALLOFF} onChange={(v) => setFalloff(v as SoftSelectionFalloff)} className="w-full" />
            </div>

            <label className="flex items-center justify-between cursor-pointer group pt-1">
              <span className="text-[10px] text-text-secondary group-hover:text-white">Show Heatmap</span>
              <input
                type="checkbox"
                checked={heatmapVisible}
                onChange={(e) => setHeatmapVisible(e.target.checked)}
                className="accent-accent"
              />
            </label>
          </>
        )}
      </div>
    </ToolSection>
  );
};
