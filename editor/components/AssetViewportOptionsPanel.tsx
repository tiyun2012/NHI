
import React from 'react';

import { Icon } from './Icon';

import type {
  MeshComponentMode,
  ToolType,
  TransformSpace,
  UIConfiguration,
  SnapSettings,
  SoftSelectionFalloff,
} from '@/types';
import type { SoftSelectionMode } from '@/engine/engine';
import type { SkeletonVizSettings } from '@/editor/state/EditorContext';

import { TransformToolOptions } from '@/editor/toolOptions/TransformToolOptions';
import { SelectToolInfo } from '@/editor/toolOptions/SelectToolInfo';
import { SnapOptions } from '@/editor/toolOptions/SnapOptions';
import { SoftSelectionOptions } from '@/editor/toolOptions/SoftSelectionOptions';
import { MeshToolsSection } from '@/editor/toolOptions/MeshToolsSection';
import { SkeletonDisplayOptions } from '@/editor/toolOptions/SkeletonDisplayOptions';

export interface AssetViewportOptionsPanelProps {
  title?: string;

  tool: ToolType;
  setTool: (tool: ToolType) => void;

  meshComponentMode: MeshComponentMode;
  setMeshComponentMode: (mode: MeshComponentMode) => void;

  // Shared/global options (optional for asset viewports)
  transformSpace?: TransformSpace;
  setTransformSpace?: (space: TransformSpace) => void;

  snapSettings?: SnapSettings;
  setSnapSettings?: (settings: SnapSettings) => void;

  skeletonViz?: SkeletonVizSettings;
  setSkeletonViz?: (settings: SkeletonVizSettings) => void;

  // Viewport overlay UI
  uiConfig: UIConfiguration;
  setUiConfig: (cfg: UIConfiguration) => void;

  // Soft selection (viewport-local)
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
}

export const AssetViewportOptionsPanel: React.FC<AssetViewportOptionsPanelProps> = ({
  title = 'Viewport Options',
  tool,
  setTool,
  meshComponentMode,
  setMeshComponentMode,
  transformSpace,
  setTransformSpace,
  snapSettings,
  setSnapSettings,
  skeletonViz,
  setSkeletonViz,
  uiConfig,
  setUiConfig,
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
}) => {
  const updateUi = <K extends keyof UIConfiguration>(key: K, value: UIConfiguration[K]) => {
    setUiConfig({ ...uiConfig, [key]: value });
  };

  const MODE_BUTTONS: { label: string; value: MeshComponentMode; icon: any }[] = [
    { label: 'Object', value: 'OBJECT', icon: 'Box' },
    { label: 'Vertex', value: 'VERTEX', icon: 'Dot' },
    { label: 'Edge', value: 'EDGE', icon: 'Minus' },
    { label: 'Face', value: 'FACE', icon: 'Square' },
  ];

  return (
    <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
      <div className="p-2 bg-panel-header border-b border-black/20 flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">{title}</span>
        <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-text-secondary">
          {meshComponentMode === 'OBJECT' ? 'Object' : 'Component'}
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
        {/* Tool */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            <Icon name="MousePointer2" size={12} /> Tool
          </div>
          <div className="bg-black/20 p-2 rounded border border-white/5">
            <div className="flex gap-2">
              <button
                className={`flex-1 px-2 py-1 rounded border border-white/5 text-xs hover:bg-white/10 ${tool === 'SELECT' ? 'text-accent bg-white/5' : 'text-text-secondary'}`}
                onClick={() => setTool('SELECT')}
              >
                Select
              </button>
              <button
                className={`flex-1 px-2 py-1 rounded border border-white/5 text-xs hover:bg-white/10 ${tool === 'MOVE' ? 'text-accent bg-white/5' : 'text-text-secondary'}`}
                onClick={() => setTool('MOVE')}
              >
                Move
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                className={`flex-1 px-2 py-1 rounded border border-white/5 text-xs hover:bg-white/10 ${tool === 'ROTATE' ? 'text-accent bg-white/5' : 'text-text-secondary'}`}
                onClick={() => setTool('ROTATE')}
              >
                Rotate
              </button>
              <button
                className={`flex-1 px-2 py-1 rounded border border-white/5 text-xs hover:bg-white/10 ${tool === 'SCALE' ? 'text-accent bg-white/5' : 'text-text-secondary'}`}
                onClick={() => setTool('SCALE')}
              >
                Scale
              </button>
            </div>
            <div className="mt-2 text-[10px] text-text-secondary opacity-80">Shortcuts: Q/W/E/R</div>
          </div>
        </div>

        {/* Component mode */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            <Icon name="Shapes" size={12} /> Component Mode
          </div>
          <div className="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded border border-white/5">
            {MODE_BUTTONS.map((b) => (
              <button
                key={b.value}
                className={`px-2 py-2 rounded border border-white/5 text-xs flex items-center gap-2 justify-center hover:bg-white/10 ${meshComponentMode === b.value ? 'text-accent bg-white/5' : 'text-text-secondary'}`}
                onClick={() => setMeshComponentMode(b.value)}
              >
                <Icon name={b.icon} size={12} /> {b.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-text-secondary opacity-80">Right-click pie menu also works.</div>
        </div>

        {/* Active tool info (shared block) */}
        {tool === 'SELECT' && <SelectToolInfo />}

        {/* Transform options (shared block) */}
        {transformSpace && setTransformSpace && (
          <TransformToolOptions />
        )}

        {/* Snapping (shared block) */}
        {snapSettings && setSnapSettings && <SnapOptions snapSettings={snapSettings} setSnapSettings={setSnapSettings} />}

        {/* Overlays */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            <Icon name="Eye" size={12} /> Overlays
          </div>
          <div className="bg-black/20 p-2 rounded border border-white/5 space-y-2">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-xs text-text-primary group-hover:text-white">Show Vertex Overlay</span>
              <input type="checkbox" checked={uiConfig.showVertexOverlay} onChange={(e) => updateUi('showVertexOverlay', e.target.checked)} className="accent-accent" />
            </label>
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-xs text-text-primary group-hover:text-white">Selection Edge Highlight</span>
              <input
                type="checkbox"
                checked={uiConfig.selectionEdgeHighlight}
                onChange={(e) => updateUi('selectionEdgeHighlight', e.target.checked)}
                className="accent-accent"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] text-text-secondary">Selection Color</span>
                <input
                  type="color"
                  value={uiConfig.selectionEdgeColor}
                  onChange={(e) => updateUi('selectionEdgeColor', e.target.value)}
                  className="w-full h-8 bg-transparent"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-text-secondary">Vertex Color</span>
                <input
                  type="color"
                  value={uiConfig.vertexColor}
                  onChange={(e) => updateUi('vertexColor', e.target.value)}
                  className="w-full h-8 bg-transparent"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-text-secondary">
                <span>Vertex Size</span>
                <span>{uiConfig.vertexSize.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={uiConfig.vertexSize}
                onChange={(e) => updateUi('vertexSize', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Soft selection (shared block) */}
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

        {/* Mesh tools (shared block) */}
        {meshComponentMode !== 'OBJECT' && <MeshToolsSection />}

        {/* Skeleton debug (shared block) */}
        {skeletonViz && setSkeletonViz && (
          <SkeletonDisplayOptions />
        )}
      </div>
    </div>
  );
};
