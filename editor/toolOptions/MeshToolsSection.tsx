import React from 'react';
import { Icon } from '@/editor/components/Icon';
import { ToolSection } from './ToolSection';

export const MeshToolsSection: React.FC = () => {
  return (
    <ToolSection title="Mesh Tools" icon="Tool" className="pt-2 border-t border-white/5">
      <div className="grid grid-cols-2 gap-2">
        <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
          <Icon name="ArrowUpSquare" size={16} /> Extrude
        </button>
        <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
          <Icon name="Scissors" size={16} /> Cut / Split
        </button>
        <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
          <Icon name="Ungroup" size={16} /> Bevel
        </button>
        <button className="bg-white/5 hover:bg-white/10 hover:text-white p-2 rounded text-xs text-center border border-white/5 transition-colors flex flex-col items-center gap-1">
          <Icon name="Merge" size={16} /> Weld
        </button>
      </div>
    </ToolSection>
  );
};
