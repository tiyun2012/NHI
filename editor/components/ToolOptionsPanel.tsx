
import React, { useContext, useMemo, useEffect, useState } from 'react';
import { EditorContext } from '@/editor/state/EditorContext';
import { toolRegistry } from '@/editor/registries/ToolRegistry';
import { uiRegistry } from '@/editor/registries/UIRegistry';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { MeshToolsSection } from '@/editor/toolOptions/MeshToolsSection';
import { SoftSelectionOptions } from '@/editor/toolOptions/SoftSelectionOptions';
import { SnapOptions } from '@/editor/toolOptions/SnapOptions';
import { PanelSection } from './ui/PanelSection';

export const ToolOptionsPanel: React.FC = () => {
  const ctx = useContext(EditorContext);
  const api = useEngineAPI();
  const [, setRegistryTick] = useState(0);

  useEffect(() => {
    return api.subscribe('ui:registryChanged', () => setRegistryTick(t => t + 1));
  }, [api]);

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
  } = ctx;

  const ToolComponent = useMemo(() => toolRegistry.get(tool), [tool]);
  
  // Get sections registered for Tool Options via API
  const dynamicSections = useMemo(() => [
      ...uiRegistry.getSections('TOOL_OPTIONS'),
      ...uiRegistry.getSections('GLOBAL')
  ], [/* tick */]);

  return (
    <div className="h-full bg-panel flex flex-col font-sans">
      {/* Header */}
      <div className="p-2 bg-panel-header border-b border-black/20 flex items-center justify-between">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">{tool} Tool</span>
        <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-text-secondary">
          {meshComponentMode === 'OBJECT' ? 'Global' : 'Component'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 space-y-4">
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
        </div>

        {/* Dynamically registered widgets via API */}
        {dynamicSections.map(section => (
            <PanelSection key={section.id} title={section.title} icon={section.icon}>
                <section.component />
            </PanelSection>
        ))}
      </div>
    </div>
  );
};
