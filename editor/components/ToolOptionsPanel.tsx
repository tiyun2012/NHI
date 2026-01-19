
import React, { useContext, useMemo } from 'react';
import { EditorContext } from '@/editor/state/EditorContext';
import { toolRegistry } from '@/editor/registries/ToolRegistry';
import { MeshToolsSection } from '@/editor/toolOptions/MeshToolsSection';
import { SkeletonDisplayOptions } from '@/editor/toolOptions/SkeletonDisplayOptions';
import { SoftSelectionOptions } from '@/editor/toolOptions/SoftSelectionOptions';
import { SnapOptions } from '@/editor/toolOptions/SnapOptions';

export const ToolOptionsPanel: React.FC = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;

  const {
    tool,
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
    snapSettings,
    setSnapSettings,
    skeletonViz,
    setSkeletonViz,
  } = ctx;

  const ToolComponent = useMemo(() => toolRegistry.get(tool), [tool]);

  return (
    <div className="h-full bg-panel flex flex-col font-sans">
      {/* Header */}
      <div className="p-2 bg-panel-header border-b border-black/20 flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">{tool} Tool</span>
        <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-text-secondary">
          {meshComponentMode === 'OBJECT' ? 'Global' : 'Component'}
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
        
        {/* Dynamic Tool Options from Registry */}
        {ToolComponent ? <ToolComponent /> : (
            <div className="text-[10px] text-text-secondary italic pb-2 border-b border-white/5">
                No specific options for this tool.
            </div>
        )}

        {/* Global snapping */}
        <SnapOptions snapSettings={snapSettings} setSnapSettings={setSnapSettings} />

        {/* Soft selection (vertex mode) */}
        {meshComponentMode === 'VERTEX' && (
          <SoftSelectionOptions
            enabled={softSelectionEnabled}
            setEnabled={setSoftSelectionEnabled}
            radius={softSelectionRadius}
            setRadius={setSoftSelectionRadius}
            mode={softSelectionMode}
            setMode={setSoftSelectionMode}
            falloff={softSelectionFalloff}
            setFalloff={setSoftSelectionFalloff}
            heatmapVisible={softSelectionHeatmapVisible}
            setHeatmapVisible={setSoftSelectionHeatmapVisible}
          />
        )}

        {/* Mesh tools */}
        {meshComponentMode !== 'OBJECT' && <MeshToolsSection />}

        {/* Skeleton debug */}
        <SkeletonDisplayOptions value={skeletonViz} onChange={setSkeletonViz} />
      </div>
    </div>
  );
};
