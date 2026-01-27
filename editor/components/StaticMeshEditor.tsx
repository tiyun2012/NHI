
import React, { useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DockLayout, { LayoutData, TabData } from 'rc-dock';

import { useViewportSize } from '@/editor/hooks/useViewportSize';
import { useBrushInteraction } from '@/editor/hooks/useBrushInteraction';
import { EditorContext, EditorContextType, DEFAULT_UI_CONFIG, DEFAULT_SKELETON_VIZ, DEFAULT_SNAP_CONFIG } from '@/editor/state/EditorContext';
import { AssetViewportEngine } from '@/editor/viewports/AssetViewportEngine';
import { useAssetViewportState } from '@/editor/viewports/useAssetViewportState';

import { assetManager } from '@/engine/AssetManager';
import { GizmoSystem } from '@/engine/GizmoSystem';
import { GizmoRenderer } from '@/engine/renderers/GizmoRenderer';
import { Mat4Utils, Vec3Utils, AABBUtils } from '@/engine/math';
import { MeshComponentMode, StaticMeshAsset, SkeletalMeshAsset, TransformSpace, SnapSettings } from '@/types';
import { consoleService } from '@/engine/Console';
import { EngineAPI, EngineCommands, EngineQueries } from '@/engine/api/types';
import { createSelectionCommands, createSelectionQueries } from '@/engine/selection';
import { EngineProvider, useEngineAPI } from '@/engine/api/EngineProvider';

import { PieMenu } from './PieMenu';
import { AssetViewportOptionsPanel } from './AssetViewportOptionsPanel';
import { StaticMeshToolbar } from './StaticMeshToolbar';
import { UVEditorPanel } from '@/features/uv-editor/components/UVEditorPanel';
import { usePieMenuInteraction, InteractionAPI } from '@/editor/hooks/usePieMenuInteraction';
import { Icon } from './Icon';

// --- INTERNAL TYPES ---
type CameraState = {
  theta: number;
  phi: number;
  radius: number;
  target: { x: number; y: number; z: number };
};

type DragState = {
  isDragging: boolean;
  startX: number;
  startY: number;
  mode: 'ORBIT' | 'PAN' | 'ZOOM';
  startCamera: CameraState;
};

type SelectionBoxState = {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  mode: MeshComponentMode;
};

// --- SHADERS ---
const LINE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
void main() { gl_Position = u_mvp * vec4(a_pos, 1.0); }`;

const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
  const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return p;
}

// --- VIEWPORT COMPONENT ---
// This handles the canvas, camera, and mouse interaction for the 3D view.
// It consumes the Engine context provided by the parent StaticMeshEditor.
const StaticMeshViewport: React.FC<{
    engine: AssetViewportEngine;
    gizmoSystem: GizmoSystem;
    onResetRef: React.MutableRefObject<() => void>;
    showGrid: boolean;
    showWireframe: boolean;
    renderMode: number;
}> = ({ engine, gizmoSystem, onResetRef, showGrid, showWireframe, renderMode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportSize = useViewportSize(containerRef, { dprCap: 2 });
    
    // API & Context
    const api = useEngineAPI(); // Will pick up the LOCAL engine API from provider
    const ctx = useContext(EditorContext)!;
    const { 
        meshComponentMode, setMeshComponentMode, 
        tool, setTool,
        softSelectionEnabled, setSoftSelectionEnabled,
        softSelectionRadius, setSoftSelectionRadius,
        softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible,
        setFocusedWidgetId
    } = ctx;

    // Interaction State
    const [camera, setCamera] = useState<CameraState>({ theta: 0.5, phi: 1.2, radius: 3.0, target: { x: 0, y: 0, z: 0 } });
    const cameraRef = useRef(camera);
    useEffect(() => { cameraRef.current = camera; }, [camera]);
    
    const [dragState, setDragState] = useState<DragState | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

    const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
    const selectionBoxRef = useRef<SelectionBoxState | null>(null);
    useEffect(() => { selectionBoxRef.current = selectionBox; }, [selectionBox]);

    // Focus Camera Logic
    const focusCamera = useCallback(() => {
        if (!engine || !engine.entityId) return;
        const selectionBounds = engine.selectionSystem.getSelectionAABB();
        
        if (selectionBounds) {
            const center = AABBUtils.center(selectionBounds, { x: 0, y: 0, z: 0 });
            const size = AABBUtils.size(selectionBounds, { x: 0, y: 0, z: 0 });
            const maxDim = Math.max(size.x, Math.max(size.y, size.z));
            setCamera(p => ({ ...p, target: center, radius: Math.max(maxDim * 1.8, 0.2) }));
        } else {
            // Default framing based on asset bounds (if we had access, otherwise default)
            setCamera(p => ({ ...p, radius: 3, target: { x: 0, y: 0, z: 0 } }));
        }
    }, [engine]);

    // Expose reset to parent
    useEffect(() => {
        onResetRef.current = () => {
            engine.resetPreviewTransform();
            focusCamera();
        };
    }, [engine, focusCamera, onResetRef]);

    // Listen for focus command
    useEffect(() => {
        return api.subscribe('selection:focus', focusCamera);
    }, [api, focusCamera]);

    // Keyboard Shortcuts (F to Focus) - Only active when this viewport is focused
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT') return;
            // IMPORTANT: Only handle key if this viewport is focused
            if (ctx.focusedWidgetId !== 'asset_viewport') return;

            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                api.commands.selection.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [api, ctx.focusedWidgetId]);

    // Pie Menu
    const { pieMenuState, openPieMenu, closePieMenu, handlePieAction } = usePieMenuInteraction({
        sceneGraph: engine.sceneGraph as any,
        selectedIds: engine.entityId ? [engine.entityId] : [],
        currentMode: meshComponentMode,
        onSelect: () => {},
        setTool,
        setMeshComponentMode,
        handleFocus: focusCamera,
        handleModeSelect: () => {}, // Handled by toolbar
        api: api.commands as any
    });

    // Brush
    const { isBrushKeyHeld, isAdjustingBrush } = useBrushInteraction({
        scopeRef: containerRef,
        isBrushContextEnabled: () => meshComponentMode !== 'OBJECT',
        onBrushAdjustEnd: () => engine.endVertexDrag(),
        brushState: {
            enabled: softSelectionEnabled, setEnabled: setSoftSelectionEnabled,
            radius: softSelectionRadius, setRadius: setSoftSelectionRadius,
            heatmapVisible: softSelectionHeatmapVisible, setHeatmapVisible: setSoftSelectionHeatmapVisible
        }
    });

    // GL Init & Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
        if (!gl) return;

        engine.initGL(gl);
        
        const gizmoRenderer = new GizmoRenderer(); 
        gizmoRenderer.init(gl);
        engine.setRenderer({ renderGizmos: (vp, pos, scale, h, a) => gizmoRenderer.renderGizmos(vp, pos, scale, h as any, a as any) });

        const lineProgram = compileProgram(gl, LINE_VS, LINE_FS);
        const gridLines: number[] = []; const gridSize = 10;
        for (let i = -gridSize; i <= gridSize; i++) {
            gridLines.push(i, 0, -gridSize, i, 0, gridSize);
            gridLines.push(-gridSize, 0, i, gridSize, 0, i);
        }
        const gridVao = gl.createVertexArray();
        const gridVbo = gl.createBuffer();
        gl.bindVertexArray(gridVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gridVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridLines), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.12, 0.12, 0.12, 1.0);

        const proj = Mat4Utils.create();
        const view = Mat4Utils.create();
        const vp = Mat4Utils.create();
        let raf = 0;

        const tick = () => {
            if (!canvasRef.current) return;
            const vs = viewportSize;
            const w = Math.max(1, vs.pixelWidth); const h = Math.max(1, vs.pixelHeight);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }

            const cam = cameraRef.current;
            const eyeX = cam.target.x + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
            const eyeY = cam.target.y + cam.radius * Math.cos(cam.phi);
            const eyeZ = cam.target.z + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
            
            // Explicitly create vectors to avoid potential 'out' parameter issues in Vec3Utils
            const eye = { x: eyeX, y: eyeY, z: eyeZ };
            
            Mat4Utils.perspective(45 * Math.PI / 180, canvas.width/canvas.height, 0.1, 1000.0, proj);
            Mat4Utils.lookAt(eye, cam.target, { x: 0, y: 1, z: 0 }, view);
            Mat4Utils.multiply(proj, view, vp);

            engine.setViewport(vp, eye, Math.max(1, vs.cssWidth), Math.max(1, vs.cssHeight));
            engine.sceneGraph.update();

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            if (showGrid) {
                gl.useProgram(lineProgram);
                gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, 'u_mvp')!, false, vp);
                gl.uniform4f(gl.getUniformLocation(lineProgram, 'u_color')!, 0.3, 0.3, 0.3, 1.0);
                gl.bindVertexArray(gridVao);
                gl.drawArrays(gl.LINES, 0, gridLines.length / 3);
            }

            engine.render(performance.now() * 0.001, renderMode);
            gizmoSystem.render();
            gl.bindVertexArray(null);
            
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); gl.deleteProgram(lineProgram); gl.deleteVertexArray(gridVao); gl.deleteBuffer(gridVbo); };
    }, [engine, gizmoSystem, showGrid, renderMode, viewportSize]); // Re-init if engine changes (unlikely) or viewport resizes

    // Mouse Handlers (Same logic as before, just using local refs)
    const handleMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation(); // Stop propagation to container windows
      
      // Set focus to this viewport
      if (setFocusedWidgetId) setFocusedWidgetId('asset_viewport');

      if (isBrushKeyHeld.current && meshComponentMode !== 'OBJECT') return;
      if (pieMenuState && e.button !== 2) closePieMenu();
      if (pieMenuState) return;
      
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

      if (e.button === 0 && !isAdjustingBrush && !e.altKey) {
          gizmoSystem.update(0, mx, my, rect.width, rect.height, true, false);
          if (gizmoSystem.activeAxis) return; 
      }

      if (e.button === 2 && !e.altKey) {
          if (engine) {
              const hit = engine.selectionSystem.selectEntityAt(mx, my, rect.width, rect.height);
              if (hit) {
                  // Only re-select if not already selected.
                  // This prevents clearing active sub-selection when right-clicking the active mesh.
                  const hitIdx = engine.ecs.idToIndex.get(hit);
                  if (hitIdx === undefined || !engine.selectionSystem.selectedIndices.has(hitIdx)) {
                      api.commands.selection.setSelected([hit]);
                  }
              }
          }
          openPieMenu(e.clientX, e.clientY, undefined);
          return;
      }

      if (e.button === 0 && !isAdjustingBrush && !e.altKey) {
          gizmoSystem.update(0, mx, my, rect.width, rect.height, true, false);
          if (gizmoSystem.activeAxis) return;

          if (meshComponentMode !== 'OBJECT' && engine.entityId) {
              const picked = engine.selectionSystem.pickMeshComponent(engine.entityId, mx, my, rect.width, rect.height);
              if (picked) {
                  // Ensure selection
                  if (engine.selectionSystem.selectedIndices.size === 0) api.commands.selection.setSelected([engine.entityId]);
                  
                  let action: 'SET' | 'TOGGLE' = 'SET';
                  if (e.shiftKey) action = 'TOGGLE';

                  if (meshComponentMode === 'VERTEX') api.commands.selection.modifySubSelection('VERTEX', [picked.vertexId], action);
                  else if (meshComponentMode === 'EDGE') api.commands.selection.modifySubSelection('EDGE', [[picked.edgeId[0], picked.edgeId[1]].sort((a,b)=>a-b).join('-')], action);
                  else if (meshComponentMode === 'FACE') api.commands.selection.modifySubSelection('FACE', [picked.faceId], action);
                  else if (meshComponentMode === 'UV') api.commands.selection.modifySubSelection('UV', [picked.vertexId], action);
                  return;
              }
              setSelectionBox({ isSelecting: true, startX: mx, startY: my, currentX: mx, currentY: my, mode: meshComponentMode });
              return;
          }
          
          const hitId = engine.selectionSystem.selectEntityAt(mx, my, rect.width, rect.height);
          if (hitId) { api.commands.selection.setSelected([hitId]); return; }
          setSelectionBox({ isSelecting: true, startX: mx, startY: my, currentX: mx, currentY: my, mode: 'OBJECT' });
          return;
      }

      if (e.altKey) {
          let mode: DragState['mode'] = 'ORBIT';
          if (e.button === 1) mode = 'PAN'; if (e.button === 2) mode = 'ZOOM';
          
          setDragState({ isDragging: true, startX: e.clientX, startY: e.clientY, mode, startCamera: { ...cameraRef.current } });
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
      
      if (isBrushKeyHeld.current) return;

      const isGizmoActive = !!gizmoSystem.activeAxis;

      if (e.buttons === 1 && !e.altKey && !dragState && !selectionBoxRef.current && !isAdjustingBrush && !isGizmoActive) {
           if ((meshComponentMode === 'VERTEX' || meshComponentMode === 'UV')) {
                engine.selectionSystem.selectVerticesInBrush(mx, my, rect.width, rect.height, !e.ctrlKey);
           }
      }

      if (selectionBoxRef.current?.isSelecting) {
          setSelectionBox(prev => prev ? ({ ...prev, currentX: mx, currentY: my }) : null);
      }

      gizmoSystem.update(0, mx, my, rect.width, rect.height, false, false);
      if (meshComponentMode === 'VERTEX' || meshComponentMode === 'UV') {
          engine.selectionSystem.highlightVertexAt(mx, my, rect.width, rect.height);
      }

      if (dragStateRef.current?.isDragging) {
          const dx = e.clientX - dragStateRef.current.startX; const dy = e.clientY - dragStateRef.current.startY;
          const ds = dragStateRef.current;
          if (ds.mode === 'ORBIT') {
              setCamera(p => ({ ...p, theta: ds.startCamera.theta + dx*0.01, phi: Math.max(0.1, Math.min(Math.PI-0.1, ds.startCamera.phi - dy*0.01)) }));
          }
          else if (ds.mode === 'ZOOM') {
              setCamera(p => ({ ...p, radius: Math.max(0.25, ds.startCamera.radius - (dx-dy)*0.05) }));
          }
          else if (ds.mode === 'PAN') {
              const panSpeed = ds.startCamera.radius * 0.002;
              const eyeX = ds.startCamera.radius * Math.sin(ds.startCamera.phi) * Math.cos(ds.startCamera.theta);
              const eyeY = ds.startCamera.radius * Math.cos(ds.startCamera.phi);
              const eyeZ = ds.startCamera.radius * Math.sin(ds.startCamera.phi) * Math.sin(ds.startCamera.theta);
              
              // Use explicit vector creation to be safe
              const eye = { x: eyeX, y: eyeY, z: eyeZ };
              const forward = Vec3Utils.create();
              Vec3Utils.scale(eye, -1, forward);
              Vec3Utils.normalize(forward, forward);
              
              const up = { x: 0, y: 1, z: 0 };
              const right = Vec3Utils.create();
              Vec3Utils.cross(forward, up, right);
              Vec3Utils.normalize(right, right);
              
              const camUp = Vec3Utils.create();
              Vec3Utils.cross(right, forward, camUp);
              Vec3Utils.normalize(camUp, camUp);
              
              const moveX = Vec3Utils.create();
              Vec3Utils.scale(right, -dx * panSpeed, moveX);
              
              const moveY = Vec3Utils.create();
              Vec3Utils.scale(camUp, dy * panSpeed, moveY);
              
              const delta = Vec3Utils.create();
              Vec3Utils.add(moveX, moveY, delta);
              
              const newTarget = Vec3Utils.create();
              Vec3Utils.add(ds.startCamera.target, delta, newTarget);

              setCamera(p => ({ ...p, target: newTarget }));
          }
      }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      const sb = selectionBoxRef.current;
      const rect = containerRef.current!.getBoundingClientRect();
      
      if (sb?.isSelecting) {
          const w = Math.abs(e.clientX - rect.left - sb.startX);
          const h = Math.abs(e.clientY - rect.top - sb.startY);
          if (w > 3 && h > 3) {
             const x = Math.min(sb.startX, e.clientX-rect.left);
             const y = Math.min(sb.startY, e.clientY-rect.top);
             api.commands.selection.selectInRect({ x, y, w, h }, sb.mode, e.shiftKey ? 'ADD' : 'SET');
          } else {
             if (!e.shiftKey) {
                 if (sb.mode !== 'OBJECT') api.commands.selection.clearSubSelection();
                 else api.commands.selection.clear();
             }
          }
          setSelectionBox(null);
      }
      gizmoSystem.update(0, e.clientX-rect.left, e.clientY-rect.top, rect.width, rect.height, false, true);
      setDragState(null);
    };

    return (
        <div ref={containerRef} 
             className={`w-full h-full relative overflow-hidden bg-[#151515] ${dragState ? 'cursor-grabbing' : 'cursor-default'}`} 
             onMouseDown={handleMouseDown} 
             onMouseMove={handleMouseMove} 
             onMouseUp={handleMouseUp} 
             onMouseEnter={() => { if(setFocusedWidgetId) setFocusedWidgetId('asset_viewport'); }}
             onWheel={(e) => setCamera(p => ({...p, radius: Math.max(0.25, p.radius + e.deltaY * 0.01)}))} 
             onContextMenu={e => e.preventDefault()}
        >
            <canvas ref={canvasRef} className="w-full h-full block relative z-10" />
            
            {selectionBox && selectionBox.isSelecting && <div className="absolute z-20 pointer-events-none border-2 border-[#4f80f8] bg-[#4f80f8]/20" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
            
            <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20 pointer-events-none">
                <span>Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}</span>
            </div>

            {pieMenuState && createPortal(
                <PieMenu 
                    x={pieMenuState.x} y={pieMenuState.y} currentMode={meshComponentMode} 
                    onSelectMode={(m) => { api.commands.mesh.setComponentMode(m); closePieMenu(); }} 
                    onAction={handlePieAction} onClose={closePieMenu} 
                />, 
                document.body
            )}
        </div>
    );
};

export const StaticMeshEditor: React.FC<{ assetId?: string }> = ({ assetId }) => {
    // Local Engine Instance for this editor window
    const [engine] = useState(() => new AssetViewportEngine());
    const gizmoSystem = useMemo(() => new GizmoSystem(engine), [engine]);
    const onResetRef = useRef<() => void>(() => {});

    // Local Viewport State (Mode, Tool, Selection, etc.)
    const vpState = useAssetViewportState();
    
    // View Settings
    const [showGrid, setShowGrid] = useState(true);
    const [showWireframe, setShowWireframe] = useState(false);
    const [renderMode, setRenderMode] = useState(0);

    // Context for DockLayout
    const dockContext = useMemo<EditorContextType>(() => ({
        // Map local state to global interface expected by panels
        entities: engine.ecs.getAllProxies(engine.sceneGraph),
        sceneGraph: engine.sceneGraph,
        selectedIds: Array.from(engine.selectionSystem.selectedIndices).map(idx => engine.ecs.store.ids[idx]),
        setSelectedIds: (ids) => engine.setSelected(ids),
        selectedAssetIds: [], setSelectedAssetIds: () => {},
        inspectedNode: null, setInspectedNode: () => {},
        activeGraphConnections: [], setActiveGraphConnections: () => {},
        updateInspectedNodeData: () => {},
        onNodeDataChange: () => {}, setOnNodeDataChange: () => {},
        selectionType: 'ENTITY', setSelectionType: () => {},
        
        // Viewport State
        tool: vpState.tool, setTool: vpState.setTool,
        meshComponentMode: vpState.meshComponentMode, setMeshComponentMode: vpState.setMeshComponentMode,
        softSelectionEnabled: vpState.softSelectionEnabled, setSoftSelectionEnabled: vpState.setSoftSelectionEnabled,
        softSelectionRadius: vpState.softSelectionRadius, setSoftSelectionRadius: vpState.setSoftSelectionRadius,
        softSelectionMode: vpState.softSelectionMode, setSoftSelectionMode: vpState.setSoftSelectionMode,
        softSelectionFalloff: vpState.softSelectionFalloff, setSoftSelectionFalloff: vpState.setSoftSelectionFalloff,
        softSelectionHeatmapVisible: vpState.softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible: vpState.setSoftSelectionHeatmapVisible,
        
        transformSpace: 'Local', setTransformSpace: () => {},
        isPlaying: false, simulationMode: 'STOPPED',
        uiConfig: vpState.uiConfig, setUiConfig: vpState.setUiConfig,
        gridConfig: DEFAULT_UI_CONFIG as any, setGridConfig: () => {},
        snapSettings: DEFAULT_SNAP_CONFIG, setSnapSettings: () => {},
        skeletonViz: DEFAULT_SKELETON_VIZ, setSkeletonViz: (v) => engine.skeletonTool.setOptions(v),
        
        focusedWidgetId: null, setFocusedWidgetId: () => {}
    }), [engine, vpState]);

    useEffect(() => {
        if (assetId) {
            engine.setPreviewMesh(assetId);
            onResetRef.current(); // Reset camera
        }
    }, [assetId, engine]);

    // Force engine update when local state changes
    useEffect(() => {
        engine.meshComponentMode = vpState.meshComponentMode;
        engine.softSelectionEnabled = vpState.softSelectionEnabled;
        engine.softSelectionRadius = vpState.softSelectionRadius;
        engine.softSelectionMode = vpState.softSelectionMode;
        engine.softSelectionFalloff = vpState.softSelectionFalloff;
        engine.softSelectionHeatmapVisible = vpState.softSelectionHeatmapVisible;
        
        // Sync UI config
        engine.uiConfig = vpState.uiConfig;
        
        engine.notifyUI();
    }, [engine, vpState]);

    // Create a local API bridge so components inside the editor (like UV Editor)
    // talk to the local engine instance instead of the global singleton.
    const localApi = useMemo(() => {
        const commands: Partial<EngineCommands> = {
            selection: createSelectionCommands(engine, { notifyUI: () => engine.notifyUI(), emit: (e, p) => engine.events.emit(e, p) }),
            mesh: {
                setComponentMode: (m) => vpState.setMeshComponentMode(m),
                updateAssetGeometry: (aid, geo) => {
                    const asset = assetManager.getAsset(aid);
                    if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                        // Apply patch to AssetManager so engine picks it up
                        Object.assign((asset as any).geometry, geo);
                        engine.notifyMeshGeometryChanged(engine.entityId!, geo);
                    }
                }
            },
            modeling: {
                extrudeFaces: () => {}, bevelEdges: () => {}, weldVertices: () => {}, connectComponents: () => {}, deleteSelectedFaces: () => {}
            },
            skeleton: {
                setOptions: (o) => { engine.skeletonTool.setOptions(o); engine.notifyUI(); }
            },
            sculpt: {
                setEnabled: (v) => vpState.setSoftSelectionEnabled(v),
                setRadius: (v) => vpState.setSoftSelectionRadius(v),
                setMode: (v) => vpState.setSoftSelectionMode(v),
                setFalloff: (v) => vpState.setSoftSelectionFalloff(v),
                setHeatmapVisible: (v) => vpState.setSoftSelectionHeatmapVisible(v)
            },
            ui: {
                setFocusedWidget: (id) => dockContext.setFocusedWidgetId(id),
                notify: () => engine.notifyUI(),
                // partial implementation
                registerSection: (_loc, _cfg) => {},
                registerWindow: (_cfg: any) => {}
            },
            scene: {
                 // partial scene commands needed for pie menu?
                createEntity: (_name) => '',
                deleteEntity: (_id) => {},
                duplicateEntity: (_id) => {},
                renameEntity: (_id, _name) => {},
                reparentEntity: (_child, _parent) => {},
                addComponent: (_id, _type) => {},
                removeComponent: (_id, _type) => {},
                createEntityFromAsset: (_aid, _pos) => null,
                loadSceneFromAsset: (_aid) => {}
            },
            simulation: { setMode: () => {} },
            history: { pushState: () => {}, undo: () => {}, redo: () => {} }
        };

        const queries: Partial<EngineQueries> = {
            // FIX: Correctly nest the selection queries so `api.queries.selection.getSubSelection` works.
            selection: createSelectionQueries(engine), // Removed undefined argument
            mesh: {
                getAssetByEntity: (eid) => {
                     // Local implementation
                     return assetManager.getAsset(assetId || '') || null;
                }
            },
            skeleton: {
                getOptions: () => engine.skeletonTool.getOptions()
            },
            ui: {
                getFocusedWidget: () => dockContext.focusedWidgetId
            },
            scene: {
                getEntities: () => dockContext.entities,
                getEntityName: (id) => engine.ecs.store.names[engine.ecs.idToIndex.get(id) ?? -1] || null,
                getEntityCount: () => engine.ecs.count
            },
            registry: { getModules: () => [] },
            simulation: { getMode: () => 'STOPPED', isPlaying: () => false, getMetrics: () => engine.metrics }
        };

        return {
            commands: commands as EngineCommands,
            queries: queries as EngineQueries,
            subscribe: (evt: string, cb: any) => {
                engine.events.on(evt, cb);
                return () => engine.events.off(evt, cb);
            }
        };
    }, [engine, vpState, dockContext, assetId]);

    const defaultLayout: LayoutData = {
        dockbox: {
            mode: 'horizontal',
            children: [
                {
                    size: 250,
                    tabs: [{ id: 'options', title: 'Options', content: <AssetViewportOptionsPanel 
                        tool={vpState.tool} setTool={vpState.setTool}
                        meshComponentMode={vpState.meshComponentMode} setMeshComponentMode={vpState.setMeshComponentMode}
                        softSelectionEnabled={vpState.softSelectionEnabled} setSoftSelectionEnabled={vpState.setSoftSelectionEnabled}
                        softSelectionRadius={vpState.softSelectionRadius} setSoftSelectionRadius={vpState.setSoftSelectionRadius}
                        softSelectionMode={vpState.softSelectionMode} setSoftSelectionMode={vpState.setSoftSelectionMode}
                        softSelectionFalloff={vpState.softSelectionFalloff} setSoftSelectionFalloff={vpState.setSoftSelectionFalloff}
                        softSelectionHeatmapVisible={vpState.softSelectionHeatmapVisible} setSoftSelectionHeatmapVisible={vpState.setSoftSelectionHeatmapVisible}
                        uiConfig={vpState.uiConfig} setUiConfig={vpState.setUiConfig}
                        skeletonViz={dockContext.skeletonViz} setSkeletonViz={dockContext.setSkeletonViz}
                    /> }]
                },
                {
                    mode: 'vertical',
                    size: 800,
                    children: [
                        {
                            size: 600,
                            tabs: [{ 
                                id: 'viewport', 
                                title: 'Viewport', 
                                content: (
                                    <div className="flex flex-col h-full bg-[#151515]">
                                        <StaticMeshToolbar 
                                            tool={vpState.tool} setTool={vpState.setTool}
                                            mode={vpState.meshComponentMode} setMode={vpState.setMeshComponentMode}
                                            showGrid={showGrid} setShowGrid={setShowGrid}
                                            showWireframe={showWireframe} setShowWireframe={setShowWireframe}
                                            onResetCamera={() => onResetRef.current()}
                                            renderMode={renderMode} setRenderMode={setRenderMode}
                                        />
                                        <div className="flex-1 relative overflow-hidden">
                                            <StaticMeshViewport 
                                                engine={engine} 
                                                gizmoSystem={gizmoSystem}
                                                onResetRef={onResetRef}
                                                showGrid={showGrid}
                                                showWireframe={showWireframe}
                                                renderMode={renderMode}
                                            />
                                        </div>
                                    </div>
                                )
                            }]
                        },
                        {
                            size: 300,
                            tabs: [{ 
                                id: 'uv', 
                                title: 'UV Editor', 
                                content: <UVEditorPanel 
                                    api={localApi}
                                    assetId={assetId}
                                /> 
                            }]
                        }
                    ]
                }
            ]
        }
    };

    return (
        <EditorContext.Provider value={dockContext}>
            <EngineProvider api={localApi}>
                <div className="w-full h-full bg-[#101010] flex flex-col text-xs font-sans">
                    <DockLayout
                        defaultLayout={defaultLayout}
                        style={{ width: '100%', height: '100%', background: '#101010' }}
                        dropMode="edge"
                    />
                </div>
            </EngineProvider>
        </EditorContext.Provider>
    );
};
