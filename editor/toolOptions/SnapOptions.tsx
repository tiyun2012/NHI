import React from 'react';
import type { SnapSettings } from '@/types';
import { ToolSection } from './ToolSection';

export const SnapOptions: React.FC<{
  snapSettings: SnapSettings;
  setSnapSettings: (s: SnapSettings) => void;
}> = ({ snapSettings, setSnapSettings }) => {
  return (
    <ToolSection title="Snapping" icon="Magnet">
      <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded border border-white/5">
        <label className="flex items-center gap-2 text-xs cursor-pointer group">
          <input
            type="checkbox"
            checked={snapSettings.active}
            onChange={(e) => setSnapSettings({ ...snapSettings, active: e.target.checked })}
            className="accent-accent"
          />
          <span className="group-hover:text-white transition-colors">Enabled</span>
        </label>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-secondary">Grid</span>
          <input
            type="number"
            className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
            value={snapSettings.move}
            onChange={(e) => setSnapSettings({ ...snapSettings, move: parseFloat(e.target.value) })}
            step={0.1}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-secondary">Rot</span>
          <input
            type="number"
            className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
            value={snapSettings.rotate}
            onChange={(e) => setSnapSettings({ ...snapSettings, rotate: parseFloat(e.target.value) })}
            step={5}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-secondary">Scl</span>
          <input
            type="number"
            className="w-full bg-input-bg text-right px-1 py-0.5 rounded text-white text-[10px] outline-none border border-transparent focus:border-accent"
            value={snapSettings.scale}
            onChange={(e) => setSnapSettings({ ...snapSettings, scale: parseFloat(e.target.value) })}
            step={0.1}
          />
        </div>
      </div>
    </ToolSection>
  );
};
