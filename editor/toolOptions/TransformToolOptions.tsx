
import React, { useContext } from 'react';
import type { ToolType, TransformSpace } from '@/types';
import { EditorContext } from '@/editor/state/EditorContext';
import { Select } from '@/editor/components/ui/Select';
import { ToolSection } from './ToolSection';

const MOVE_OPTIONS = [
  { label: 'Local', value: 'Local' },
  { label: 'Parent', value: 'Parent' },
  { label: 'Virtual Pivot', value: 'VirtualPivot' },
  { label: 'World', value: 'World' },
  { label: 'Normal', value: 'Normal' },
  { label: 'Average Component', value: 'Average' },
];

const ROTATE_OPTIONS = [
  { label: 'World', value: 'World' },
  { label: 'Object', value: 'Object' },
  { label: 'Gimbal', value: 'Gimbal' },
  { label: 'Virtual Pivot', value: 'VirtualPivot' },
];

const SCALE_OPTIONS = [
  { label: 'World', value: 'World' },
  { label: 'Local', value: 'Local' },
];

function getOptions(tool: ToolType) {
  if (tool === 'MOVE') return MOVE_OPTIONS;
  if (tool === 'ROTATE') return ROTATE_OPTIONS;
  if (tool === 'SCALE') return SCALE_OPTIONS;
  return [];
}

function getTitle(tool: ToolType) {
  if (tool === 'MOVE') return { title: 'Move Settings', icon: 'Move' };
  if (tool === 'ROTATE') return { title: 'Rotate Settings', icon: 'RotateCw' };
  if (tool === 'SCALE') return { title: 'Scale Settings', icon: 'Maximize' };
  return { title: 'Transform Settings', icon: 'Move' };
}

export const TransformToolOptions: React.FC = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  const { tool, transformSpace, setTransformSpace } = ctx;

  if (tool !== 'MOVE' && tool !== 'ROTATE' && tool !== 'SCALE') return null;

  const { title, icon } = getTitle(tool);
  const options = getOptions(tool);

  return (
    <ToolSection title={title} icon={icon} className="pb-2 border-b border-white/5">
      <div className="bg-black/20 p-2 rounded border border-white/5">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-text-primary">Coordinate Space</span>
        </div>
        <div className="mt-1">
          <Select value={transformSpace} options={options} onChange={(v) => setTransformSpace(v as TransformSpace)} className="w-full" />
        </div>

        {tool === 'ROTATE' && transformSpace === 'Gimbal' && (
          <div className="mt-2 text-[10px] text-accent opacity-80 flex items-center gap-2 p-1 border border-dashed border-accent/30 rounded">
            <span>Gimbal Rings Active</span>
          </div>
        )}

        {tool === 'SCALE' && (
          <div className="mt-2 text-[9px] opacity-40">
            Use 'World' to scale multiple objects relative to selection center.
          </div>
        )}
      </div>
    </ToolSection>
  );
};
