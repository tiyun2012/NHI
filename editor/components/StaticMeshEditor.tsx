
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
        const gridLines = []; const gridSize = 10;
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
            
            Mat4Utils.perspective(45 * Math.PI / 180, canvas.width/canvas.height, 0.1, 1000.0, proj);
            Mat4Utils.lookAt({ x: eyeX, y: eyeY, z: eyeZ }, cam.target, { x: 0, y: 1, z: 0 }, view);
            Mat4Utils.multiply(proj, view, vp);

            engine.setViewport(vp, {x:eyeX, y:eyeY, z:eyeZ}, Math.max(1, vs.cssWidth), Math.max(1, vs.cssHeight));
            engine.sceneGraph.update();

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            if (showGrid) {
                gl.useProgram(lineProgram);
                gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, 'u_mvp'), false, vp);
                gl.uniform4f(gl.getUniformLocation(lineProgram, 'u_color'), 0.3, 0.3, 0.3, 1.0);
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
      // Set focus to this viewport
      if (setFocusedWidgetId) setFocusedWidgetId('asset_viewport');

      if (isBrushKeyHeld.current && meshComponentMode !== 'OBJECT') return;
      if (pieMenuState && e.button !== 2) closePieMenu();
      if (pieMenuState) return;
      
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

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
          openPieMenu(e.clientX, e.clientY);
          return;
      }

      if (e.button === 0 && !e.altKey) {
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
              const forward = Vec3Utils.normalize({x: -eyeX, y: -eyeY, z: -eyeZ}, {x:0,y:0,z:0});
              const right = Vec3Utils.normalize(Vec3Utils.cross(forward, {x:0,y:1,z:0}, {x:0,y:0,z:0}));
              const camUp = Vec3Utils.normalize(Vec3Utils.cross(right, forward, {x:0,y:0,z:0}), {x:0,y:0,z:0});
              const moveX = Vec3Utils.scale(right, -dx * panSpeed, {x:0,y:0,z:0});
              const moveY = Vec3Utils.scale(camUp, dy * panSpeed, {x:0,y:0,z:0});
              setCamera(p => ({ ...p, target: Vec3Utils.add(ds.startCamera.target, Vec3Utils.add(moveX, moveY, {x:0,y:0,z:0}), {x:0,y:0,z:0}) }));
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

export const StaticMeshEditor: React.FC<{ assetId: string }> = ({ assetId }) => {
  const editorCtx = useContext(EditorContext);
  // Track local focus state for this editor window (Viewport vs UV Editor)
  const [localFocusedWidget, setLocalFocusedWidget] = useState<string>('asset_viewport');

  const [transformSpaceLocal, setTransformSpaceLocal] = useState<TransformSpace>('World');
  const [snapSettingsLocal, setSnapSettingsLocal] = useState<SnapSettings>(DEFAULT_SNAP_CONFIG);
  const [skeletonVizLocal, setSkeletonVizLocal] = useState(DEFAULT_SKELETON_VIZ);

  // Local state for view settings
  const viewportState = useAssetViewportState({
    tool: editorCtx?.tool ?? 'SELECT',
    meshComponentMode: editorCtx?.meshComponentMode ?? 'OBJECT',
    softSelectionEnabled: editorCtx?.softSelectionEnabled ?? false,
    softSelectionRadius: editorCtx?.softSelectionRadius ?? 1.0,
    softSelectionMode: editorCtx?.softSelectionMode ?? 'FIXED',
    softSelectionFalloff: editorCtx?.softSelectionFalloff ?? 'VOLUME',
    softSelectionHeatmapVisible: editorCtx?.softSelectionHeatmapVisible ?? false,
    uiConfig: editorCtx?.uiConfig ?? DEFAULT_UI_CONFIG
  });

  const {
    tool, setTool, meshComponentMode, setMeshComponentMode,
    softSelectionEnabled, setSoftSelectionEnabled,
    softSelectionRadius, setSoftSelectionRadius,
    softSelectionMode, setSoftSelectionMode,
    softSelectionFalloff, setSoftSelectionFalloff,
    softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible,
    uiConfig, setUiConfig,
  } = viewportState;

  // Use global UI config if available for consistent vertex display settings
  const effectiveUiConfig = editorCtx?.uiConfig ?? uiConfig;
  const setEffectiveUiConfig = editorCtx?.setUiConfig ?? setUiConfig;

  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [renderMode, setRenderMode] = useState<number>(0);
  
  const resetCameraRef = useRef<() => void>(() => {});
  
  // -- Engine Instance Management --
  // We create one instance of the engine logic and gizmo system to be shared across docked panels
  const [engineState] = useState(() => {
      const engine = new AssetViewportEngine(() => {}, () => {});
      const gizmoSystem = new GizmoSystem(engine);
      gizmoSystem.renderInSelectTool = true;
      return { engine, gizmoSystem };
  });
  
  const { engine, gizmoSystem } = engineState;

  // Sync Engine Properties
  useEffect(() => {
      engine.meshComponentMode = meshComponentMode;
      engine.softSelectionEnabled = softSelectionEnabled;
      engine.softSelectionRadius = softSelectionRadius;
      engine.softSelectionMode = softSelectionMode;
      engine.softSelectionFalloff = softSelectionFalloff;
      engine.softSelectionHeatmapVisible = softSelectionHeatmapVisible;
      engine.uiConfig = effectiveUiConfig;
      engine.skeletonTool.setOptions(skeletonVizLocal);
      engine.recalculateSoftSelection(true, meshComponentMode);
      
      gizmoSystem.setTool(tool);
  }, [
      meshComponentMode, softSelectionEnabled, softSelectionRadius, softSelectionMode, 
      softSelectionFalloff, softSelectionHeatmapVisible, effectiveUiConfig, skeletonVizLocal, tool
  ]);

  // Load Asset
  useEffect(() => {
      if (!assetId) return;
      engine.setPreviewMesh(assetId);
      engine.syncTransforms(false);
      resetCameraRef.current?.();
  }, [assetId, engine]);

  // Interaction API
  const localInteractionApi = useMemo<InteractionAPI>(() => {
      const baseApi: InteractionAPI = {
          selection: createSelectionCommands(engine, { emit: (e, p) => engine.events.emit(e, p), notifyUI: () => engine.notifyUI() }),
          mesh: {
              setComponentMode: (m) => {
                  engine.meshComponentMode = m;
                  setMeshComponentMode(m);
              }
          },
          scene: {
              deleteEntity: () => console.warn("Cannot delete preview asset entity"),
              duplicateEntity: () => engine.resetPreviewTransform()
          },
          modeling: {
              extrudeFaces: () => engine.extrudeFaces(),
              bevelEdges: () => engine.bevelEdges(),
              weldVertices: () => engine.weldVertices(),
              connectComponents: () => engine.connectComponents(),
              deleteSelectedFaces: () => engine.deleteSelectedFaces(),
          },
          sculpt: {
              setEnabled: (v) => setSoftSelectionEnabled(v),
              setRadius: (v) => setSoftSelectionRadius(v),
              setHeatmapVisible: (v) => setSoftSelectionHeatmapVisible(v),
          }
      };
      return baseApi;
  }, [engine, setMeshComponentMode, setSoftSelectionEnabled, setSoftSelectionRadius, setSoftSelectionHeatmapVisible]);

  // Engine API Adapter
  const localEngineApi = useMemo<EngineAPI>(() => {
      const commands: Partial<EngineCommands> = {
          selection: createSelectionCommands(engine, { emit: (e, p) => engine.events.emit(e, p), notifyUI: () => engine.notifyUI() }),
          mesh: {
              setComponentMode: (m) => localInteractionApi.mesh.setComponentMode(m),
              updateAssetGeometry: (aId, geom) => {
                  const asset = assetManager.getAsset(aId);
                  if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                      const meshAsset = asset as StaticMeshAsset;
                      if (geom.vertices) meshAsset.geometry.vertices = geom.vertices;
                      if (geom.normals) meshAsset.geometry.normals = geom.normals;
                      if (geom.uvs) meshAsset.geometry.uvs = geom.uvs;
                      if (geom.indices) meshAsset.geometry.indices = geom.indices;
                      
                      if (engine.entityId) {
                          engine.notifyMeshGeometryChanged(engine.entityId);
                      }
                  }
              }
          },
          modeling: {
              extrudeFaces: localInteractionApi.modeling.extrudeFaces,
              bevelEdges: localInteractionApi.modeling.bevelEdges,
              weldVertices: localInteractionApi.modeling.weldVertices,
              connectComponents: localInteractionApi.modeling.connectComponents,
              deleteSelectedFaces: localInteractionApi.modeling.deleteSelectedFaces
          },
          skeleton: {
              setOptions: (options) => {
                  setSkeletonVizLocal(prev => ({ ...prev, ...options }));
                  engine.skeletonTool.setOptions(options);
                  engine.notifyUI();
              }
          },
          sculpt: {
              setEnabled: localInteractionApi.sculpt?.setEnabled || (() => {}),
              setRadius: localInteractionApi.sculpt?.setRadius || (() => {}),
              setMode: (m) => setSoftSelectionMode(m),
              setFalloff: (f) => setSoftSelectionFalloff(f),
              setHeatmapVisible: localInteractionApi.sculpt?.setHeatmapVisible || (() => {})
          }
      } as any;

      const queries: Partial<EngineQueries> = {
          selection: createSelectionQueries(engine),
          mesh: {
              getAssetByEntity: (eid) => {
                  if (engine.entityId === eid) {
                      return assetManager.getAsset(assetId) || null;
                  }
                  return null;
              }
          },
          skeleton: {
              getOptions: () => engine.skeletonTool.getOptions() || DEFAULT_SKELETON_VIZ
          },
          simulation: {
              getMode: () => 'STOPPED',
              isPlaying: () => false,
              getMetrics: () => ({ fps: 60, frameTime: 16, drawCalls: 1, triangleCount: 0, entityCount: 1 })
          },
          ui: {
              getFocusedWidget() {
                  return localFocusedWidget;
              }
          }
      } as any;

      return {
          commands: commands as EngineCommands,
          queries: queries as EngineQueries,
          subscribe: ((event: string, cb: (payload: any) => void) => {
              engine.events.on(event, cb);
              return () => engine.events.off(event, cb);
          }) as any
      };
  }, [localInteractionApi, assetId, engine, localFocusedWidget]);

  const localEditorContext = useMemo<EditorContextType>(() => {
      const base = editorCtx || {} as any;
      return {
          ...base,
          entities: [],
          sceneGraph: engine.sceneGraph as any,
          selectedIds: engine.selectionSystem.selectedIndices.size ? [engine.entityId!] : [],
          setSelectedIds: (ids) => localInteractionApi.selection.setSelected(ids),
          selectedAssetIds: [assetId],
          setSelectedAssetIds: () => {},
          
          tool, setTool,
          meshComponentMode, setMeshComponentMode,
          
          transformSpace: transformSpaceLocal, setTransformSpace: setTransformSpaceLocal,
          snapSettings: snapSettingsLocal, setSnapSettings: setSnapSettingsLocal,
          skeletonViz: skeletonVizLocal, setSkeletonViz: setSkeletonVizLocal,
          
          softSelectionEnabled, setSoftSelectionEnabled,
          softSelectionRadius, setSoftSelectionRadius,
          softSelectionMode, setSoftSelectionMode,
          softSelectionFalloff, setSoftSelectionFalloff,
          softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible,
          
          uiConfig: effectiveUiConfig, setUiConfig: setEffectiveUiConfig,
          
          // Focus Management
          focusedWidgetId: localFocusedWidget, 
          setFocusedWidgetId: (id) => {
              setLocalFocusedWidget(id || 'asset_viewport');
              if (base.setFocusedWidgetId) base.setFocusedWidgetId(id);
          }
      };
  }, [
      editorCtx, localInteractionApi, assetId, 
      tool, meshComponentMode, transformSpaceLocal, snapSettingsLocal, skeletonVizLocal,
      softSelectionEnabled, softSelectionRadius, softSelectionMode, softSelectionFalloff, softSelectionHeatmapVisible,
      effectiveUiConfig, localFocusedWidget
  ]);

  const defaultLayout: LayoutData = {
      dockbox: {
          mode: 'horizontal',
          children: [
              {
                  mode: 'vertical',
                  size: 800,
                  children: [
                      { 
                          tabs: [{ id: 'viewport', title: 'Viewport', content: <StaticMeshViewport engine={engine} gizmoSystem={gizmoSystem} onResetRef={resetCameraRef} showGrid={showGrid} showWireframe={showWireframe} renderMode={renderMode} />, closable: false }] 
                      },
                      { 
                          size: 300,
                          tabs: [{ id: 'uv_editor', title: 'UV Editor', content: <UVEditorPanel api={localEngineApi} assetId={assetId} />, closable: false }] 
                      }
                  ]
              },
              {
                  size: 320,
                  tabs: [{ 
                      id: 'options', 
                      title: 'Options', 
                      content: (
                        <AssetViewportOptionsPanel
                            tool={tool} setTool={setTool}
                            meshComponentMode={meshComponentMode} setMeshComponentMode={(m) => localInteractionApi.mesh.setComponentMode(m)}
                            uiConfig={effectiveUiConfig} setUiConfig={setEffectiveUiConfig}
                            softSelectionEnabled={softSelectionEnabled} setSoftSelectionEnabled={setSoftSelectionEnabled}
                            softSelectionRadius={softSelectionRadius} setSoftSelectionRadius={setSoftSelectionRadius}
                            softSelectionMode={softSelectionMode} setSoftSelectionMode={setSoftSelectionMode}
                            softSelectionFalloff={softSelectionFalloff} setSoftSelectionFalloff={setSoftSelectionFalloff}
                            softSelectionHeatmapVisible={softSelectionHeatmapVisible} setSoftSelectionHeatmapVisible={setSoftSelectionHeatmapVisible}
                            skeletonViz={skeletonVizLocal} setSkeletonViz={setSkeletonVizLocal}
                            transformSpace={transformSpaceLocal} setTransformSpace={setTransformSpaceLocal}
                            snapSettings={snapSettingsLocal} setSnapSettings={setSnapSettingsLocal}
                        />
                      ),
                      closable: false
                  }]
              }
          ]
      }
  };

  return (
    <EditorContext.Provider value={localEditorContext}>
        <EngineProvider api={localEngineApi}>
            <div className="flex flex-col h-full bg-[#151515] select-none text-xs">
              <StaticMeshToolbar 
                  tool={tool} setTool={setTool}
                  mode={meshComponentMode} setMode={(m) => localInteractionApi.mesh.setComponentMode(m)}
                  showGrid={showGrid} setShowGrid={setShowGrid}
                  showWireframe={showWireframe} setShowWireframe={setShowWireframe}
                  onResetCamera={() => resetCameraRef.current()}
                  renderMode={renderMode} setRenderMode={setRenderMode}
              />
              <div className="flex-1 relative">
                  <DockLayout
                      defaultLayout={defaultLayout}
                      style={{ width: '100%', height: '100%', background: '#151515' }}
                      dropMode="edge"
                  />
              </div>
            </div>
        </EngineProvider>
    </EditorContext.Provider>
  );
};
