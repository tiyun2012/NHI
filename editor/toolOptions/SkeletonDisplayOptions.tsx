
import React from 'react';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { Checkbox, NumberInput } from '@/editor/components/ui';

/**
 * Reusable Skeleton Display Widget.
 * Uses Engine API directly to observe and mutate state,
 * allowing it to be registered into any panel.
 */
export const SkeletonDisplayOptions: React.FC = () => {
  const api = useEngineAPI();
  
  // In a real implementation, we might want a hook that subscribes to changes.
  // For now, we rely on the parent's re-render or engine notifications.
  const options = api.queries.skeleton.getOptions();

  const update = (patch: any) => {
    api.commands.skeleton.setOptions(patch);
  };

  return (
    <div className="space-y-2">
        <Checkbox 
            label="Enable Overlay" 
            checked={options.enabled} 
            onChange={(v) => update({ enabled: v })} 
        />

        <div className="grid grid-cols-3 gap-1">
          <Checkbox 
            label="Joints" 
            checked={options.drawJoints} 
            onChange={(v) => update({ drawJoints: v })} 
            className="flex-col !items-start"
          />
          <Checkbox 
            label="Bones" 
            checked={options.drawBones} 
            onChange={(v) => update({ drawBones: v })} 
            className="flex-col !items-start"
          />
          <Checkbox 
            label="Axes" 
            checked={options.drawAxes} 
            onChange={(v) => update({ drawAxes: v })} 
            className="flex-col !items-start"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-text-secondary uppercase">
            <span>Joint Size</span>
            <span className="font-mono text-white">{Math.round(options.jointRadius)}px</span>
          </div>
          <input
            type="range"
            min="2"
            max="50"
            step="1"
            value={options.jointRadius}
            onChange={(e) => update({ jointRadius: parseFloat(e.target.value) })}
            className="w-full"
            aria-label="Joint Radius"
            title="Joint Radius"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-text-secondary uppercase">
            <span>Root Scale</span>
            <span className="font-mono text-white">{options.rootScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="0.05"
            value={options.rootScale}
            onChange={(e) => update({ rootScale: parseFloat(e.target.value) })}
            className="w-full"
            aria-label="Root Scale"
            title="Root Scale"
          />
        </div>
    </div>
  );
};
