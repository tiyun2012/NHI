import React from 'react';
import type { SkeletonVizSettings } from '@/editor/state/EditorContext';
import { ToolSection } from './ToolSection';

export const SkeletonDisplayOptions: React.FC<{
  value: SkeletonVizSettings;
  onChange: (v: SkeletonVizSettings) => void;
}> = ({ value, onChange }) => {
  return (
    <ToolSection title="Skeleton Display" icon="Bone" className="pt-2 border-t border-white/5">
      <div className="bg-black/20 p-2 rounded border border-white/5 space-y-2">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-xs text-text-primary group-hover:text-white">Enable</span>
          <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer group">
            <input type="checkbox" checked={value.drawJoints} onChange={(e) => onChange({ ...value, drawJoints: e.target.checked })} />
            <span className="text-text-primary group-hover:text-white">Joints</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer group">
            <input type="checkbox" checked={value.drawBones} onChange={(e) => onChange({ ...value, drawBones: e.target.checked })} />
            <span className="text-text-primary group-hover:text-white">Bones</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer group">
            <input type="checkbox" checked={value.drawAxes} onChange={(e) => onChange({ ...value, drawAxes: e.target.checked })} />
            <span className="text-text-primary group-hover:text-white">Axes</span>
          </label>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>Joint Radius</span>
            <span>{Math.round(value.jointRadius)}px</span>
          </div>
          <input
            type="range"
            min="2"
            max="50"
            step="1"
            value={value.jointRadius}
            onChange={(e) => onChange({ ...value, jointRadius: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>Root Scale</span>
            <span>{value.rootScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="0.05"
            value={value.rootScale}
            onChange={(e) => onChange({ ...value, rootScale: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>
    </ToolSection>
  );
};
