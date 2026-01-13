import React from 'react';
import type { SoftSelectionMode } from '@/engine/engine';
import { MeshComponentMode, SoftSelectionFalloff } from '@/types';
import { Icon } from './Icon';
import { Select } from './ui/Select';

const SOFT_SEL_MODES = [
  { label: 'Fixed (Surface)', value: 'FIXED' },
  { label: 'Dynamic (Volume)', value: 'DYNAMIC' },
];

const SOFT_SEL_FALLOFF = [
  { label: 'Volume (Euclidean)', value: 'VOLUME' },
  { label: 'Surface (Geodesic)', value: 'SURFACE' },
];

export interface SoftSelectionPanelProps {
  meshComponentMode: MeshComponentMode;

  softSelectionEnabled: boolean;
  setSoftSelectionEnabled: (enabled: boolean) => void;

  softSelectionRadius: number;
  setSoftSelectionRadius: (radius: number) => void;

  softSelectionMode: SoftSelectionMode;
  setSoftSelectionMode: (mode: SoftSelectionMode) => void;

  softSelectionFalloff: SoftSelectionFalloff;
  setSoftSelectionFalloff: (falloff: SoftSelectionFalloff) => void;

  softSelectionHeatmapVisible: boolean;
  setSoftSelectionHeatmapVisible: (visible: boolean) => void;

  shortcutLabel?: string;
}

export const SoftSelectionPanel: React.FC<SoftSelectionPanelProps> = ({
  meshComponentMode,
  softSelectionEnabled,
  setSoftSelectionEnabled,
  softSelectionRadius,
  setSoftSelectionRadius,
  softSelectionMode,
  setSoftSelectionMode,
  softSelectionFalloff,
  setSoftSelectionFalloff,
  softSelectionHeatmapVisible,
  setSoftSelectionHeatmapVisible,
  shortcutLabel = 'B',
}) => {
  if (meshComponentMode !== 'VERTEX') return null;

  return (
    <div className="space-y-2 pt-2 border-t border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
          <Icon name="Target" size={12} /> Soft Selection
        </div>
        <span className="text-[9px] text-text-secondary bg-white/5 px-1 rounded">{shortcutLabel}</span>
      </div>

      <div className="bg-black/20 p-2 rounded border border-white/5 space-y-2">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-xs text-text-primary group-hover:text-white">Enable</span>
          <input
            type="checkbox"
            checked={softSelectionEnabled}
            onChange={(e) => setSoftSelectionEnabled(e.target.checked)}
            className="accent-accent"
          />
        </label>

        {softSelectionEnabled && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-text-secondary">
                <span>Falloff Radius</span>
                <span>{softSelectionRadius.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={softSelectionRadius}
                onChange={(e) => setSoftSelectionRadius(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-text-secondary">Calculation Mode</span>
              <Select
                value={softSelectionMode}
                options={SOFT_SEL_MODES}
                onChange={(v) => setSoftSelectionMode(v as any)}
                className="w-full"
              />
            </div>

            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-text-secondary">Distance Type</span>
              <Select
                value={softSelectionFalloff}
                options={SOFT_SEL_FALLOFF}
                onChange={(v) => setSoftSelectionFalloff(v as any)}
                className="w-full"
              />
            </div>

            <label className="flex items-center justify-between cursor-pointer group pt-1">
              <span className="text-[10px] text-text-secondary group-hover:text-white">Show Heatmap (B)</span>
              <input
                type="checkbox"
                checked={softSelectionHeatmapVisible}
                onChange={(e) => setSoftSelectionHeatmapVisible(e.target.checked)}
                className="accent-accent"
              />
            </label>

            <div className="text-[10px] text-text-secondary opacity-80">
              Tip: Hold <span className="text-white/80 font-semibold">B</span> + drag left/right to change radius.
            </div>
          </>
        )}
      </div>
    </div>
  );
};
