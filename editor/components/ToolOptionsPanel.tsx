import React, { useContext } from 'react';
import { EditorContext } from '@/editor/state/EditorContext';
import { TransformToolOptions } from '@/editor/toolOptions/TransformToolOptions';
import { SelectToolInfo } from '@/editor/toolOptions/SelectToolInfo';
import { SnapOptions } from '@/editor/toolOptions/SnapOptions';
import { SoftSelectionOptions } from '@/editor/toolOptions/SoftSelectionOptions';
import { MeshToolsSection } from '@/editor/toolOptions/MeshToolsSection';
import { SkeletonDisplayOptions } from '@/editor/toolOptions/SkeletonDisplayOptions';

/**
 * Tool options panel is now composed from small, reusable blocks.
 *
 * These blocks accept props (instead of reaching into EditorContext directly),
 * so they can be embedded in other widgets/windows (asset preview, modal, etc).
 */
export const ToolOptionsPanel: React.FC = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;

  const {
    tool,
    transformSpace,
    setTransformSpace,
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
        {/* Active tool */}
        {tool === 'SELECT' && <SelectToolInfo />}

        <TransformToolOptions tool={tool} transformSpace={transformSpace} setTransformSpace={setTransformSpace} />

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
