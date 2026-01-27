
import React, { useContext, useEffect, useRef, useState } from 'react';
import { WindowManagerContext, WindowManagerContextType } from '@/editor/components/WindowManager';
import { EditorContext, EditorContextType } from '@/editor/state/EditorContext';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { consoleService } from '@/engine/Console';
import { uiRegistry } from '@/editor/registries/UIRegistry';
import { engineInstance } from '@/engine/engine';
import { assetManager } from '@/engine/AssetManager';

// Components
import { Toolbar } from '@/editor/components/Toolbar';
import { HierarchyPanel } from '@/editor/components/HierarchyPanel';
import { InspectorPanel } from '@/editor/components/InspectorPanel';
import { SceneView } from '@/editor/components/SceneView';
import { ProjectPanel } from '@/editor/components/ProjectPanel';
import { ConsolePanel } from '@/editor/components/ConsolePanel'; 
import { Icon } from '@/editor/components/Icon';
import { PreferencesModal } from '@/editor/components/PreferencesModal';
import { GeometrySpreadsheet } from '@/editor/components/GeometrySpreadsheet';
import { Timeline } from '@/editor/components/Timeline';
import { SkinningEditor } from '@/editor/components/SkinningEditor';
import { ToolOptionsPanel } from '@/editor/components/ToolOptionsPanel'; 
import { WorkspaceShell } from '@/editor/components/WorkspaceShell';

// --- Widget Wrappers (Bridges between Context and Panels) ---

const HierarchyWrapper = () => {
  const ctx = useContext(EditorContext) as EditorContextType | null;
  if (!ctx) return null;
  return (
    <HierarchyPanel 
      entities={ctx.entities} 
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={(ids) => {
          ctx.setSelectedIds(ids);
          ctx.setSelectionType('ENTITY');
      }}
    />
  );
};

const InspectorWrapper = () => {
  const ctx = useContext(EditorContext) as EditorContextType | null;
  if (!ctx) return null;
  
  let target: any = null;
  let count = 0;

  if (ctx.inspectedNode) {
      target = ctx.inspectedNode;
      return <InspectorPanel object={target} type="NODE" />;
  }

  if (ctx.selectionType === 'ENTITY') {
      if (ctx.selectedIds.length > 0) {
          target = ctx.entities.find(e => e.id === ctx.selectedIds[0]) || null;
          count = ctx.selectedIds.length;
      }
  } else if (ctx.selectionType === 'ASSET') {
      if (ctx.selectedAssetIds.length > 0) {
          target = assetManager.getAsset(ctx.selectedAssetIds[0]) || null;
          count = ctx.selectedAssetIds.length;
      }
  } else if (['VERTEX', 'EDGE', 'FACE'].includes(ctx.selectionType)) {
      if (ctx.selectedIds.length > 0) {
          target = ctx.entities.find(e => e.id === ctx.selectedIds[0]) || null;
      }
  }

  return <InspectorPanel object={target} selectionCount={count} type={ctx.selectionType} />;
};

const SceneWrapper = () => {
  const ctx = useContext(EditorContext) as EditorContextType | null;
  if (!ctx) return null;
  return (
    <SceneView 
      entities={ctx.entities}
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={(ids) => {
          ctx.setSelectedIds(ids);
          ctx.setSelectionType('ENTITY');
      }}
      tool={ctx.tool}
    />
  );
};

const ProjectWrapper = () => <ProjectPanel />;
const ConsoleWrapper = () => <ConsolePanel />;
const ToolOptionsWrapper = () => <ToolOptionsPanel />; 

const StatsContent = () => {
    const [metrics, setMetrics] = useState(engineInstance.metrics);
    useEffect(() => {
        const i = setInterval(() => setMetrics({ ...engineInstance.metrics }), 500);
        return () => clearInterval(i);
    }, []);

    return (
        <div className="p-4 space-y-3 bg-transparent">
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">FPS</div>
                    <div className="text-lg font-mono text-emerald-400">{metrics.fps.toFixed(0)}</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Frame Time</div>
                    <div className="text-lg font-mono text-blue-400">{metrics.frameTime.toFixed(2)}ms</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Draw Calls</div>
                    <div className="text-lg font-mono text-orange-400">{metrics.drawCalls}</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Entities</div>
                    <div className="text-lg font-mono text-white">{metrics.entityCount}</div>
                </div>
            </div>
        </div>
    );
};

const StatusBarInfo: React.FC = () => {
    const api = useEngineAPI();
    const { meshComponentMode, selectedIds, simulationMode, focusedWidgetId } = useContext(EditorContext) as EditorContextType;
    const [statusText, setStatusText] = useState('Ready');
    const [hintText, setHintText] = useState('');

    useEffect(() => {
        const update = () => {
            if (simulationMode !== 'STOPPED') {
                setStatusText(simulationMode === 'GAME' ? 'GAME MODE' : 'SIMULATING');
                setHintText('Press Esc to release cursor');
                return;
            }

            if (meshComponentMode === 'OBJECT') {
                if (selectedIds.length > 0) {
                    const count = selectedIds.length;
                    const lastId = selectedIds[count - 1];
                    const name = api.queries.scene.getEntityName(lastId) || 'Object';
                    setStatusText(count === 1 ? name : `${count} Objects`);
                    setHintText('Alt+LMB Orbit • MMB Pan • Wheel Zoom');
                } else {
                    setStatusText('Ready');
                    setHintText('Select an object to edit');
                }
            } else {
                const stats = api.queries.selection.getSubSelectionStats();
                if (meshComponentMode === 'VERTEX') {
                    const count = stats.vertexCount;
                    if (count === 0) { setStatusText('Vertex Mode'); setHintText('Click to select vertices'); } 
                    else { setStatusText(count === 1 ? `Vertex ID: ${stats.lastVertex}` : `${count} Vertices`); setHintText(count === 1 ? 'Alt+Click 2nd Vertex for Loop' : 'Drag to Move Selection'); }
                } else if (meshComponentMode === 'EDGE') {
                    const count = stats.edgeCount;
                    if (count === 0) { setStatusText('Edge Mode'); setHintText('Click to select edges'); }
                    else { setStatusText(`${count} Edges`); setHintText('Alt+Click for Loop'); }
                } else if (meshComponentMode === 'FACE') {
                    const count = stats.faceCount;
                    if (count === 0) { setStatusText('Face Mode'); setHintText('Click to select faces'); }
                    else { setStatusText(count === 1 ? `Face ID: ${stats.lastFace}` : `${count} Faces`); setHintText('Alt+Click edge for Strip'); }
                }
            }
        };
        update();
        const offs = [
            api.subscribe('selection:changed', update),
            api.subscribe('selection:subChanged', update),
            api.subscribe('scene:entityRenamed', update),
            api.subscribe('simulation:modeChanged', update),
        ];
        return () => offs.forEach(off => off());
    }, [api, meshComponentMode, selectedIds, simulationMode]);

    return (
        <div className="flex items-center gap-3">
            {simulationMode === 'GAME' ? (
                <span className="text-emerald-500 animate-pulse font-bold flex items-center gap-2"><Icon name="Gamepad2" size={12} /> GAME MODE</span>
            ) : simulationMode === 'SIMULATE' ? (
                <span className="text-indigo-400 animate-pulse font-bold flex items-center gap-2"><Icon name="Activity" size={12} /> SIMULATING</span>
            ) : (
                <>
                    {focusedWidgetId && <span className="text-accent font-mono text-[9px] bg-accent/10 px-1.5 py-0.5 rounded mr-1">{focusedWidgetId}</span>}
                    <span className="font-semibold text-white/90 text-[11px]">{statusText}</span>
                    {hintText && <div className="h-3 w-px bg-white/10 mx-1"></div>}
                    <span className="text-text-secondary hidden sm:inline text-[10px] opacity-70">{hintText}</span>
                </>
            )}
        </div>
    );
};

export const EditorLayout: React.FC = () => {
    const wm = useContext(WindowManagerContext) as WindowManagerContextType | null;
    const initialized = useRef(false);
    const api = useEngineAPI();
    const [tick, setTick] = useState(0);

    // Re-register windows when registry changes (e.g. module hot load)
    useEffect(() => {
        return api.subscribe('ui:registryChanged', () => {
            setTick(t => t + 1);
        });
    }, [api]);

    useEffect(() => {
        if (!wm) return;

        // Register Core Windows
        wm.registerWindow({ id: 'hierarchy', title: 'Hierarchy', icon: 'ListTree', content: <HierarchyWrapper />, width: 280, height: 500, initialPosition: { x: 80, y: 100 } });
        wm.registerWindow({ id: 'inspector', title: 'Inspector', icon: 'Settings2', content: <InspectorWrapper />, width: 320, height: 600, initialPosition: { x: window.innerWidth - 340, y: 100 } });
        wm.registerWindow({ id: 'tool_options', title: 'Tool Options', icon: 'Tool', content: <ToolOptionsWrapper />, width: 280, height: 350, initialPosition: { x: window.innerWidth - 640, y: 100 } });
        wm.registerWindow({ id: 'project', title: 'Project Browser', icon: 'FolderOpen', content: <ProjectWrapper />, width: 600, height: 350, initialPosition: { x: 380, y: window.innerHeight - 370 } });
        wm.registerWindow({ id: 'console', title: 'Console', icon: 'Terminal', content: <ConsoleWrapper />, width: 500, height: 250, initialPosition: { x: 80, y: window.innerHeight - 270 } });
        wm.registerWindow({ id: 'spreadsheet', title: 'Geometry Spreadsheet', icon: 'Table', content: <GeometrySpreadsheet />, width: 550, height: 400, initialPosition: { x: 450, y: window.innerHeight - 450 } });
        wm.registerWindow({ id: 'preferences', title: 'Preferences', icon: 'Settings', content: <PreferencesModal onClose={() => wm.closeWindow('preferences')} />, width: 500 });
        wm.registerWindow({ id: 'stats', title: 'Performance', icon: 'Activity', content: <StatsContent />, width: 280, initialPosition: { x: window.innerWidth - 300, y: 60 } });
        wm.registerWindow({ id: 'skinning', title: 'Skinning Editor', icon: 'PersonStanding', content: <SkinningEditor />, width: 300, height: 400, initialPosition: { x: window.innerWidth - 650, y: 100 } });
        wm.registerWindow({ id: 'timeline', title: 'Timeline', icon: 'Film', content: <Timeline />, width: window.innerWidth - 450, height: 200, initialPosition: { x: 400, y: window.innerHeight - 220 } });

        // Register Dynamic Windows
        uiRegistry.getWindows().forEach(win => {
            const Content = win.component;
            wm.registerWindow({
                id: win.id,
                title: win.title,
                icon: win.icon,
                width: win.width,
                height: win.height,
                initialPosition: win.initialPosition,
                content: <Content />
            });
        });

        // Open Default Layout Once
        if (!initialized.current) {
            wm.openWindow('hierarchy');
            wm.openWindow('inspector');
            wm.openWindow('tool_options');
            wm.openWindow('project');
            consoleService.init(); 
            initialized.current = true;
        }
    }, [wm, tick]); 

    const handleLoad = () => {
        const json = localStorage.getItem('ti3d_scene');
        if (json) {
            engineInstance.loadScene(json);
            consoleService.success("Scene Loaded Successfully", "System");
        } else {
            consoleService.warn("No saved scene found in local storage.", "System");
        }
    };

    const handleSave = () => {
        const json = engineInstance.saveScene();
        localStorage.setItem('ti3d_scene', json);
        consoleService.success("Scene Saved", "System");
    };

    return (
        <div className="flex flex-col h-screen bg-[#101010] text-text-primary overflow-hidden font-sans relative">
            <Toolbar onSave={handleSave} onLoad={handleLoad} />

            <div className="flex-1 min-h-0 relative z-0">
                <WorkspaceShell>
                    <SceneWrapper />
                </WorkspaceShell>
            </div>

            <div className="w-full h-6 bg-panel-header/90 backdrop-blur flex items-center px-4 justify-between text-[10px] text-text-secondary shrink-0 select-none z-50 border-t border-white/5">
                <StatusBarInfo />
                <div className="flex items-center gap-4 font-mono opacity-60">
                    <span>{engineInstance.metrics.entityCount} Objects</span>
                    <span>{engineInstance.metrics.fps.toFixed(0)} FPS</span>
                </div>
            </div>
        </div>
    );
};
