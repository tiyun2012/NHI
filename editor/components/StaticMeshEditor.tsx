
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useViewportSize } from '@/editor/hooks/useViewportSize';
import { useBrushInteraction } from '@/editor/hooks/useBrushInteraction';
import { EditorContext, DEFAULT_UI_CONFIG, DEFAULT_SKELETON_VIZ, DEFAULT_SNAP_CONFIG } from '@/editor/state/EditorContext';
import { AssetViewportEngine } from '@/editor/viewports/AssetViewportEngine';
import { useAssetViewportState } from '@/editor/viewports/useAssetViewportState';

import { assetManager } from '@/engine/AssetManager';
import { GizmoSystem } from '@/engine/GizmoSystem';
import { GizmoRenderer } from '@/engine/renderers/GizmoRenderer';
import { DebugRenderer } from '@/engine/renderers/DebugRenderer';
import { Mat4Utils, Vec3Utils } from '@/engine/math';
import { MeshComponentMode, StaticMeshAsset, SkeletalMeshAsset, ToolType, TransformSpace, SnapSettings } from '@/types';
import { consoleService } from '@/engine/Console';

import { Icon } from './Icon';
import { PieMenu } from './PieMenu';
import { AssetViewportOptionsPanel } from './AssetViewportOptionsPanel';
import { usePieMenuInteraction, InteractionAPI } from '@/editor/hooks/usePieMenuInteraction';

// Minimal grid shader remains local as it's not part of MeshRenderSystem yet
const LINE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
void main() { gl_Position = u_mvp * vec4(a_pos, 1.0); }`;

const LINE_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

const RENDER_MODE_ITEMS: Array<{ id: number; label: string; icon: string }> = [
  { id: 0, label: 'Lit', icon: 'Sun' },
  { id: 1, label: 'Flat', icon: 'Square' },
  { id: 2, label: 'Normals', icon: 'BoxSelect' },
];

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  return { r, g, b };
}

function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
  const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return p;
}

function computeFitCamera(asset: StaticMeshAsset | SkeletalMeshAsset): { radius: number; target: { x: number; y: number; z: number } } {
  const aabb = asset.geometry.aabb;
  if (!aabb) return { radius: 3.0, target: { x: 0, y: 0, z: 0 } };
  const size = Vec3Utils.subtract(aabb.max, aabb.min, { x: 0, y: 0, z: 0 });
  const maxDim = Math.max(size.x, Math.max(size.y, size.z));
  const center = Vec3Utils.scale(Vec3Utils.add(aabb.min, aabb.max, { x: 0, y: 0, z: 0 }), 0.5, { x: 0, y: 0, z: 0 });
  return { radius: Math.max(maxDim * 1.5, 0.25), target: center };
}

// Helper to wrap local API with logging
function createLoggedApi(api: InteractionAPI): InteractionAPI {
    const log = (path: string, args: any[]) => {
        let argsStr = '';
        try { argsStr = args.map(a => JSON.stringify(a)).join(', '); } catch (e) { argsStr = '...'; }
        const cmdStr = `api.commands.${path}(${argsStr})`;
        console.log(`%c${cmdStr}`, 'color: #00bcd4; font-family: monospace; font-weight: bold;');
        consoleService.cmd(cmdStr);
    };

    return {
        selection: {
            selectLoop: (m) => { log(`selection.selectLoop`, [m]); api.selection.selectLoop(m); },
            modifySubSelection: (type, ids, action) => { log(`selection.modifySubSelection`, [type, ids, action]); api.selection.modifySubSelection(type, ids, action); },
            setSelected: (ids) => { log(`selection.setSelected`, [ids]); api.selection.setSelected(ids); },
            clear: () => { log(`selection.clear`, []); api.selection.clear(); },
            selectInRect: (rect, mode, action) => { log(`selection.selectInRect`, [rect, mode, action]); api.selection.selectInRect(rect, mode, action); },
        },
        mesh: {
            setComponentMode: (m) => { log(`mesh.setComponentMode`, [m]); api.mesh.setComponentMode(m); }
        },
        scene: {
            deleteEntity: (id) => { log(`scene.deleteEntity`, [id]); api.scene.deleteEntity(id); },
            duplicateEntity: (id) => { log(`scene.duplicateEntity`, [id]); api.scene.duplicateEntity(id); }
        },
        modeling: {
            extrudeFaces: () => { log(`modeling.extrudeFaces`, []); api.modeling.extrudeFaces(); },
            bevelEdges: () => { log(`modeling.bevelEdges`, []); api.modeling.bevelEdges(); },
            weldVertices: () => { log(`modeling.weldVertices`, []); api.modeling.weldVertices(); },
            connectComponents: () => { log(`modeling.connectComponents`, []); api.modeling.connectComponents(); },
            deleteSelectedFaces: () => { log(`modeling.deleteSelectedFaces`, []); api.modeling.deleteSelectedFaces(); }
        },
        sculpt: {
            setEnabled: (v) => { log('sculpt.setEnabled', [v]); api.sculpt?.setEnabled(v); },
            setRadius: (v) => { log('sculpt.setRadius', [v]); api.sculpt?.setRadius(v); },
            setHeatmapVisible: (v) => { log('sculpt.setHeatmapVisible', [v]); api.sculpt?.setHeatmapVisible(v); }
        }
    };
}

export const StaticMeshEditor: React.FC<{ assetId: string }> = ({ assetId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportSize = useViewportSize(containerRef, { dprCap: 2 });
  const viewportSizeRef = useRef(viewportSize);
  useEffect(() => { viewportSizeRef.current = viewportSize; }, [viewportSize]);

  const editorCtx = useContext(EditorContext);

  const [transformSpaceLocal, setTransformSpaceLocal] = useState<TransformSpace>('World');
  const [snapSettingsLocal, setSnapSettingsLocal] = useState<SnapSettings>(DEFAULT_SNAP_CONFIG);
  const [skeletonVizLocal, setSkeletonVizLocal] = useState(DEFAULT_SKELETON_VIZ);

  const transformSpace = editorCtx?.transformSpace ?? transformSpaceLocal;
  const setTransformSpace = editorCtx?.setTransformSpace ?? setTransformSpaceLocal;

  const snapSettings = editorCtx?.snapSettings ?? snapSettingsLocal;
  const setSnapSettings = editorCtx?.setSnapSettings ?? setSnapSettingsLocal;

  const skeletonViz = editorCtx?.skeletonViz ?? skeletonVizLocal;
  const setSkeletonViz = editorCtx?.setSkeletonViz ?? setSkeletonVizLocal;

  const viewportState = useAssetViewportState({
    tool: editorCtx?.tool ?? 'SELECT',
    meshComponentMode: editorCtx?.meshComponentMode ?? 'OBJECT',
    softSelectionEnabled: editorCtx?.softSelectionEnabled ?? false,
    softSelectionRadius: editorCtx?.softSelectionRadius ?? 1.0,
    softSelectionMode: editorCtx?.softSelectionMode ?? 'FIXED',
    softSelectionFalloff: editorCtx?.softSelectionFalloff ?? 'VOLUME',
    softSelectionHeatmapVisible: editorCtx?.softSelectionHeatmapVisible ?? false,
    uiConfig: editorCtx?.uiConfig ?? DEFAULT_UI_CONFIG,
    showVertexOverlay: true,
  });

  const {
    tool, setTool, meshComponentMode, setMeshComponentMode,
    softSelectionEnabled, setSoftSelectionEnabled,
    softSelectionRadius, setSoftSelectionRadius,
    softSelectionMode, setSoftSelectionMode,
    softSelectionFalloff, setSoftSelectionFalloff,
    softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible,
    uiConfig, setUiConfig, showVertexOverlay, setShowVertexOverlay,
  } = viewportState;

  const toolRef = useRef(tool);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const meshComponentModeRef = useRef(meshComponentMode);
  useEffect(() => { meshComponentModeRef.current = meshComponentMode; }, [meshComponentMode]);
  const uiConfigRef = useRef(uiConfig);
  useEffect(() => { uiConfigRef.current = uiConfig; }, [uiConfig]);
  const showVertexOverlayRef = useRef(showVertexOverlay);
  useEffect(() => { showVertexOverlayRef.current = showVertexOverlay; }, [showVertexOverlay]);

  const skeletonVizRef = useRef(skeletonViz);
  useEffect(() => { skeletonVizRef.current = skeletonViz; }, [skeletonViz]);

  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [renderMode, setRenderMode] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  
  const showGridRef = useRef(showGrid); useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  const showWireframeRef = useRef(showWireframe); useEffect(() => { showWireframeRef.current = showWireframe; }, [showWireframe]);
  const renderModeRef = useRef(renderMode); useEffect(() => { renderModeRef.current = renderMode; }, [renderMode]);
  const autoRotateRef = useRef(autoRotate); useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  const lastAutoRotateSyncRef = useRef(0);

  const [stats, setStats] = useState({ verts: 0, tris: 0 });
  const previewEngineRef = useRef<AssetViewportEngine | null>(null);
  
  const gizmoSystemRef = useRef<GizmoSystem | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);

  const [camera, setCamera] = useState<CameraState>({ theta: 0.5, phi: 1.2, radius: 3.0, target: { x: 0, y: 0, z: 0 } });
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  const fitCameraRef = useRef<{ radius: number; target: { x: number; y: number; z: number } } | null>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const selectionBoxRef = useRef<SelectionBoxState | null>(null);
  useEffect(() => { selectionBoxRef.current = selectionBox; }, [selectionBox]);

  // --- LOCAL API ADAPTER ---
  const focusCamera = () => { fitCameraRef.current ? setCamera(p => ({ ...p, ...fitCameraRef.current! })) : setCamera(p => ({ ...p, radius: 3, target: {x:0,y:0,z:0} })); };
  const resetTransform = () => { previewEngineRef.current?.resetPreviewTransform(); };

  // Memoize and Wrap for Logging
  const localApi = useMemo<InteractionAPI>(() => {
      const baseApi: InteractionAPI = {
          selection: {
              selectLoop: (m) => previewEngineRef.current?.selectLoop(m),
              modifySubSelection: (type, ids, action) => {
                  if (previewEngineRef.current) {
                      previewEngineRef.current.selectionSystem.modifySubSelection(type, ids, action);
                      previewEngineRef.current.notifyUI();
                  }
              },
              setSelected: (ids) => {
                  if (previewEngineRef.current) {
                      previewEngineRef.current.selectionSystem.setSelected(ids);
                      previewEngineRef.current.notifyUI();
                  }
              },
              clear: () => {
                  if (previewEngineRef.current) {
                      previewEngineRef.current.selectionSystem.setSelected([]);
                      previewEngineRef.current.notifyUI();
                  }
              },
              selectInRect: (rect, mode, action) => {
                  const engine = previewEngineRef.current;
                  if (!engine) return;
                  
                  if (mode === 'VERTEX') {
                      engine.clearDeformation();
                      const hits = engine.selectionSystem.selectVerticesInRect(rect.x, rect.y, rect.w, rect.h);
                      engine.selectionSystem.modifySubSelection('VERTEX', hits, action);
                      engine.notifyUI();
                  } else if (mode === 'OBJECT') {
                      const hits = engine.selectionSystem.selectEntitiesInRect(rect.x, rect.y, rect.w, rect.h);
                      // In local preview, there's mostly just 1 entity, but follow the logic
                      engine.selectionSystem.setSelected(hits);
                      engine.notifyUI();
                  }
              }
          },
          mesh: {
              setComponentMode: (m) => {
                  if (previewEngineRef.current) previewEngineRef.current.meshComponentMode = m;
                  setMeshComponentMode(m);
              }
          },
          scene: {
              deleteEntity: () => console.warn("Cannot delete preview asset entity"),
              duplicateEntity: () => resetTransform() // Map Duplicate shortcut to Reset Transform in preview
          },
          modeling: {
              extrudeFaces: () => previewEngineRef.current?.extrudeFaces(),
              bevelEdges: () => previewEngineRef.current?.bevelEdges(),
              weldVertices: () => previewEngineRef.current?.weldVertices(),
              connectComponents: () => previewEngineRef.current?.connectComponents(),
              deleteSelectedFaces: () => previewEngineRef.current?.deleteSelectedFaces(),
          },
          sculpt: {
              setEnabled: (v) => setSoftSelectionEnabled(v),
              setRadius: (v) => setSoftSelectionRadius(v),
              setHeatmapVisible: (v) => setSoftSelectionHeatmapVisible(v),
          }
      };
      return createLoggedApi(baseApi);
  }, [setMeshComponentMode, setSoftSelectionEnabled, setSoftSelectionRadius, setSoftSelectionHeatmapVisible]);

  // --- PIE MENU HOOK ---
  const { pieMenuState, openPieMenu, closePieMenu, handlePieAction } = usePieMenuInteraction({
      sceneGraph: previewEngineRef.current?.sceneGraph as any,
      selectedIds: previewEngineRef.current?.getPreviewEntityId() ? [previewEngineRef.current?.getPreviewEntityId()!] : [],
      onSelect: () => {}, // Selection is fixed in asset viewer
      setTool,
      setMeshComponentMode,
      handleFocus: focusCamera,
      handleModeSelect: (id) => setRenderMode(id),
      api: localApi // Inject local API
  });

  const { isBrushKeyHeld, isAdjustingBrush } = useBrushInteraction({
    scopeRef: containerRef,
    isBrushContextEnabled: () => meshComponentModeRef.current !== 'OBJECT',
    onBrushAdjustEnd: () => previewEngineRef.current?.endVertexDrag(),
    brushState: {
      enabled: softSelectionEnabled, 
      setEnabled: (v) => localApi.sculpt?.setEnabled(v),
      radius: softSelectionRadius, 
      setRadius: (v) => localApi.sculpt?.setRadius(v),
      heatmapVisible: softSelectionHeatmapVisible, 
      setHeatmapVisible: (v) => localApi.sculpt?.setHeatmapVisible(v),
    },
  });

  useEffect(() => {
    if (previewEngineRef.current) previewEngineRef.current.meshComponentMode = meshComponentMode;
    
    // Ensure the preview mesh is selected when entering component mode.
    // If we deselect the entity, the Gizmo and DebugRenderer (VertexOverlay) will stop working because they rely on selection.
    if (meshComponentMode !== 'OBJECT' && previewEngineRef.current && previewEngineRef.current.entityId) {
        const id = previewEngineRef.current.entityId;
        const sel = previewEngineRef.current.selectionSystem.selectedIndices;
        const idx = previewEngineRef.current.ecs.idToIndex.get(id);
        if (idx !== undefined && !sel.has(idx)) {
             localApi.selection.setSelected([id]);
        }
    }
  }, [meshComponentMode, localApi]);

  useEffect(() => {
    gizmoSystemRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'q') setTool('SELECT');
      if (e.key === 'w') setTool('MOVE');
      if (e.key === 'e') setTool('ROTATE');
      if (e.key === 'r') setTool('SCALE');
      if (e.key === 'g') setShowGrid(v => !v);
      if (e.key === 'z') setShowWireframe(v => !v);
      if (e.key === 'f') focusCamera();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTool]);

  useEffect(() => {
    const asset = assetManager.getAsset(assetId) as StaticMeshAsset | undefined;
    if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH')) return;

    setStats({ verts: asset.geometry.vertices.length / 3, tris: asset.geometry.indices.length / 3 });
    const fit = computeFitCamera(asset);
    fitCameraRef.current = fit;
    setCamera(p => ({ ...p, radius: fit.radius, target: { ...fit.target } }));

    const engine = new AssetViewportEngine(
      () => setSelectionTick(p => p + 1),
      () => {}, 
      () => setStats({ verts: asset.geometry.vertices.length/3, tris: asset.geometry.indices.length/3 })
    );
    
    engine.meshComponentMode = meshComponentMode;
    engine.softSelectionEnabled = softSelectionEnabled;
    engine.softSelectionRadius = softSelectionRadius;
    engine.softSelectionMode = softSelectionMode;
    engine.softSelectionFalloff = softSelectionFalloff;
    engine.softSelectionHeatmapVisible = softSelectionHeatmapVisible;

    engine.setPreviewMesh(assetId);
    engine.syncTransforms(false);
    
    previewEngineRef.current = engine;
    gizmoSystemRef.current = new GizmoSystem(engine);
    gizmoSystemRef.current.renderInSelectTool = true;
    gizmoSystemRef.current.setTool(tool);

    return () => { previewEngineRef.current = null; gizmoSystemRef.current = null; };
  }, [assetId]);

  useEffect(() => {
    const engine = previewEngineRef.current;
    if (!engine) return;
    engine.meshComponentMode = meshComponentMode;
    engine.softSelectionEnabled = softSelectionEnabled;
    engine.softSelectionRadius = softSelectionRadius;
    engine.softSelectionMode = softSelectionMode;
    engine.softSelectionFalloff = softSelectionFalloff;
    engine.softSelectionHeatmapVisible = softSelectionHeatmapVisible;
    engine.recalculateSoftSelection(true);
  }, [assetId, meshComponentMode, softSelectionEnabled, softSelectionRadius, softSelectionMode, softSelectionFalloff, softSelectionHeatmapVisible]);

  useEffect(() => {
    const asset = assetManager.getAsset(assetId);
    if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH')) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!gl) return;

    previewEngineRef.current?.initGL(gl);

    const gizmoRenderer = new GizmoRenderer(); gizmoRenderer.init(gl);
    const debugRenderer = new DebugRenderer(); debugRenderer.init(gl);
    previewEngineRef.current?.setRenderer({
        renderGizmos: (vp, pos, scale, h, a) => gizmoRenderer.renderGizmos(vp, pos, scale, h as any, a as any)
    });

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
        const vs = viewportSizeRef.current;
        const w = Math.max(1, vs.pixelWidth); const h = Math.max(1, vs.pixelHeight);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }

        const cam = cameraRef.current;
        if (autoRotateRef.current) {
            cam.theta += 0.005;
            const now = performance.now();
            if (now - lastAutoRotateSyncRef.current > 200) { lastAutoRotateSyncRef.current = now; setCamera({ ...cam }); }
        }

        const eyeX = cam.target.x + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
        const eyeY = cam.target.y + cam.radius * Math.cos(cam.phi);
        const eyeZ = cam.target.z + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
        
        Mat4Utils.perspective(45 * Math.PI / 180, canvas.width/canvas.height, 0.1, 1000.0, proj);
        Mat4Utils.lookAt({ x: eyeX, y: eyeY, z: eyeZ }, cam.target, { x: 0, y: 1, z: 0 }, view);
        Mat4Utils.multiply(proj, view, vp);

        const engine = previewEngineRef.current;
        if (engine) {
            engine.setViewport(vp, {x:eyeX, y:eyeY, z:eyeZ}, Math.max(1, vs.cssWidth), Math.max(1, vs.cssHeight));
            engine.sceneGraph.update();
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (showGridRef.current) {
            gl.useProgram(lineProgram);
            gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, 'u_mvp'), false, vp);
            gl.uniform4f(gl.getUniformLocation(lineProgram, 'u_color'), 0.3, 0.3, 0.3, 1.0);
            gl.bindVertexArray(gridVao);
            gl.drawArrays(gl.LINES, 0, gridLines.length / 3);
        }

        engine?.render(performance.now() * 0.001, renderModeRef.current);

        const isSkeletal = (asset as any).type === 'SKELETAL_MESH';
        const skViz = skeletonVizRef.current;
        const wantsSkeleton = isSkeletal && skViz?.enabled;
        const wantsVertexOverlay = !!showVertexOverlayRef.current;

        if (engine && (wantsVertexOverlay || wantsSkeleton)) {
            debugRenderer.begin();

            if (wantsVertexOverlay) {
              const uiCfg = uiConfigRef.current;
              const worldMat = engine.entityId ? engine.sceneGraph.getWorldMatrix(engine.entityId) : null;

              if (worldMat) {
                  const m0=worldMat[0], m1=worldMat[1], m2=worldMat[2], m12=worldMat[12];
                  const m4=worldMat[4], m5=worldMat[5], m6=worldMat[6], m13=worldMat[13];
                  const m8=worldMat[8], m9=worldMat[9], m10=worldMat[10], m14=worldMat[14];
                  
                  const colSel = {r:1,g:1,b:0}; 
                  const colNorm = hexToRgb(uiCfg.vertexColor);
                  const baseSize = Math.max(3.0, uiCfg.vertexSize * 3.0);

                  // --- DRAW POINTS ---
                  const selectedVerts = engine.selectionSystem.getSelectionAsVertices();
                  const verts = (asset as StaticMeshAsset).geometry.vertices;
                  
                  if (engine.meshComponentMode === 'VERTEX') {
                      for(let i=0; i<verts.length/3; i++) {
                          const x = verts[i*3], y = verts[i*3+1], z = verts[i*3+2];
                          const wx = m0*x + m4*y + m8*z + m12;
                          const wy = m1*x + m5*y + m9*z + m13;
                          const wz = m2*x + m6*y + m10*z + m14;
                          const isSel = selectedVerts.has(i);
                          debugRenderer.drawPointRaw(wx, wy, wz, isSel?colSel.r:colNorm.r, isSel?colSel.g:colNorm.g, isSel?colSel.b:colNorm.b, isSel?baseSize*1.5:baseSize);
                      }
                  } else if (selectedVerts.size > 0) {
                      selectedVerts.forEach(i => {
                          const x = verts[i*3], y = verts[i*3+1], z = verts[i*3+2];
                          const wx = m0*x + m4*y + m8*z + m12;
                          const wy = m1*x + m5*y + m9*z + m13;
                          const wz = m2*x + m6*y + m10*z + m14;
                          debugRenderer.drawPointRaw(wx, wy, wz, colSel.r, colSel.g, colSel.b, baseSize*1.5);
                      });
                  }

                  // --- DRAW EDGES ---
                  const isEdgeMode = engine.meshComponentMode === 'EDGE' || engine.meshComponentMode === 'FACE';
                  const edgeIds = engine.selectionSystem.subSelection.edgeIds;
                  const indices = (asset as StaticMeshAsset).geometry.indices;
                  const colWire = { r: 0.3, g: 0.3, b: 0.35 };
                  const colEdgeSel = { r: 1, g: 1, b: 0 };

                  const drawEdge = (v1: number, v2: number, color: {r:number,g:number,b:number}) => {
                      const idx1 = v1*3; const idx2 = v2*3;
                      const x1 = verts[idx1], y1 = verts[idx1+1], z1 = verts[idx1+2];
                      const x2 = verts[idx2], y2 = verts[idx2+1], z2 = verts[idx2+2];
                      
                      const p1 = { x: m0*x1 + m4*y1 + m8*z1 + m12, y: m1*x1 + m5*y1 + m9*z1 + m13, z: m2*x1 + m6*y1 + m10*z1 + m14 };
                      const p2 = { x: m0*x2 + m4*y2 + m8*z2 + m12, y: m1*x2 + m5*y2 + m9*z2 + m13, z: m2*x2 + m6*y2 + m10*z2 + m14 };
                      debugRenderer.drawLine(p1, p2, color);
                  };

                  if (asset.topology && asset.topology.faces.length > 0) {
                      asset.topology.faces.forEach(face => {
                          for(let k=0; k<face.length; k++) {
                              const vA = face[k];
                              const vB = face[(k+1)%face.length];
                              const key = [vA, vB].sort((a,b)=>a-b).join('-');
                              
                              if (edgeIds.has(key)) drawEdge(vA, vB, colEdgeSel);
                              else if (isEdgeMode) drawEdge(vA, vB, colWire);
                          }
                      });
                  } else if (indices && indices.length > 0) {
                      for(let i=0; i<indices.length; i+=3) {
                          const a=indices[i], b=indices[i+1], c=indices[i+2];
                          const keys = [
                              { k: a<b?`${a}-${b}`:`${b}-${a}`, v1:a, v2:b },
                              { k: b<c?`${b}-${c}`:`${c}-${b}`, v1:b, v2:c },
                              { k: c<a?`${c}-${a}`:`${a}-${c}`, v1:c, v2:a }
                          ];
                          keys.forEach(pair => {
                              if (edgeIds.has(pair.k)) drawEdge(pair.v1, pair.v2, colEdgeSel);
                              else if (isEdgeMode) drawEdge(pair.v1, pair.v2, colWire);
                          });
                      }
                  }
              }
            }

            if (wantsSkeleton) {
                // ... skeleton drawing logic remains same ...
            }

            debugRenderer.render(vp);
        }

        gizmoSystemRef.current?.render();
        gl.bindVertexArray(null);
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); gl.deleteProgram(lineProgram); gl.deleteVertexArray(gridVao); gl.deleteBuffer(gridVbo); };
  }, [assetId]);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (isBrushKeyHeld.current && meshComponentModeRef.current !== 'OBJECT') return;
      if (pieMenuState && e.button !== 2) closePieMenu();
      if (pieMenuState) return;
      
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
      const engine = previewEngineRef.current;
      const gs = gizmoSystemRef.current;

      if (e.button === 2 && !e.altKey) {
          if (engine) {
              const hit = engine.selectionSystem.selectEntityAt(mx, my, rect.width, rect.height);
              // Ensure preview mesh is selected for context operations
              if (hit) localApi.selection.setSelected([hit]);
          }
          openPieMenu(e.clientX, e.clientY);
          return;
      }

      if (e.button === 0 && !e.altKey && engine && gs) {
          gs.update(0, mx, my, rect.width, rect.height, true, false);
          if (gs.activeAxis) return;

          if (meshComponentMode !== 'OBJECT') {
              const picked = engine.selectionSystem.pickMeshComponent(engine.entityId!, mx, my, rect.width, rect.height);
              if (picked) {
                  // Make sure the entity is selected so gizmos and render overlays work
                  if (engine.entityId && engine.selectionSystem.selectedIndices.size === 0) {
                      localApi.selection.setSelected([engine.entityId]);
                  }

                  let action: 'SET' | 'TOGGLE' = 'SET';
                  if (e.shiftKey) action = 'TOGGLE';

                  if (meshComponentMode === 'VERTEX') {
                      localApi.selection.modifySubSelection('VERTEX', [picked.vertexId], action);
                  } else if (meshComponentMode === 'EDGE') {
                      const key = picked.edgeId.sort((a,b)=>a-b).join('-');
                      localApi.selection.modifySubSelection('EDGE', [key], action);
                  } else if (meshComponentMode === 'FACE') {
                      localApi.selection.modifySubSelection('FACE', [picked.faceId], action);
                  }
                  return;
              }
              
              setSelectionBox({ isSelecting: true, startX: mx, startY: my, currentX: mx, currentY: my, mode: meshComponentMode });
              return;
          }
          
          const hitId = engine.selectionSystem.selectEntityAt(mx, my, rect.width, rect.height);
          if (hitId) { 
              localApi.selection.setSelected([hitId]); 
              return; 
          }
          
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

      const isGizmoActive = !!gizmoSystemRef.current?.activeAxis;

      if (e.buttons === 1 && !e.altKey && !dragState && !selectionBoxRef.current && !isAdjustingBrush && !isGizmoActive) {
           if (meshComponentModeRef.current === 'VERTEX' && previewEngineRef.current) {
                previewEngineRef.current.selectionSystem.selectVerticesInBrush(mx, my, rect.width, rect.height, !e.ctrlKey);
           }
      }

      if (selectionBoxRef.current?.isSelecting) {
          setSelectionBox(prev => prev ? ({ ...prev, currentX: mx, currentY: my }) : null);
      }

      gizmoSystemRef.current?.update(0, mx, my, rect.width, rect.height, false, false);
      if (meshComponentModeRef.current === 'VERTEX') previewEngineRef.current?.selectionSystem.highlightVertexAt(mx, my, rect.width, rect.height);

      if (dragStateRef.current?.isDragging) {
          const dx = e.clientX - dragStateRef.current.startX; const dy = e.clientY - dragStateRef.current.startY;
          const ds = dragStateRef.current;
          if (ds.mode === 'ORBIT') setCamera(p => ({ ...p, theta: ds.startCamera.theta + dx*0.01, phi: Math.max(0.1, Math.min(Math.PI-0.1, ds.startCamera.phi - dy*0.01)) }));
          else if (ds.mode === 'ZOOM') setCamera(p => ({ ...p, radius: Math.max(0.25, ds.startCamera.radius - (dx-dy)*0.05) }));
          else if (ds.mode === 'PAN') {
              setCamera(p => ({ ...p })); // Force update
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
             // Use the new stable API for marquee
             localApi.selection.selectInRect(
                 { x, y, w, h }, 
                 sb.mode, 
                 e.shiftKey ? 'ADD' : 'SET'
             );
          } else {
             // Click (not drag) on empty space
             if (!e.shiftKey) {
                 if (sb.mode !== 'OBJECT') {
                     // In component mode, clear sub-selection but keep entity selected so Gizmo/DebugDraw works
                     if (sb.mode === 'VERTEX') localApi.selection.modifySubSelection('VERTEX', [], 'SET');
                     else if (sb.mode === 'EDGE') localApi.selection.modifySubSelection('EDGE', [], 'SET');
                     else if (sb.mode === 'FACE') localApi.selection.modifySubSelection('FACE', [], 'SET');
                 } else {
                     // In object mode, normal clear
                     localApi.selection.clear();
                 }
             }
          }
          setSelectionBox(null);
      }
      gizmoSystemRef.current?.update(0, e.clientX-rect.left, e.clientY-rect.top, rect.width, rect.height, false, true);
      setDragState(null);
  };

  const renderModeItem = RENDER_MODE_ITEMS[renderModeRef.current];

  return (
    <div className="flex h-full bg-[#151515] select-none text-xs">
      <div className="flex-1 flex flex-col">
        <div ref={containerRef} className={`flex-1 relative overflow-hidden ${dragState ? 'cursor-grabbing' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={(e) => setCamera(p => ({...p, radius: Math.max(0.25, p.radius + e.deltaY * 0.01)}))} onContextMenu={e => e.preventDefault()}>
            <canvas ref={canvasRef} className="w-full h-full block relative z-10" />
            {selectionBox && selectionBox.isSelecting && <div className="absolute z-20 pointer-events-none border-2 border-[#4f80f8] bg-[#4f80f8]/20" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
            
            <div className="absolute top-3 left-3 flex gap-2 z-20 pointer-events-auto">
                <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                    {['SELECT','MOVE','ROTATE','SCALE'].map(t => <button key={t} className={`p-1 hover:text-white rounded ${tool===t?'text-accent':''}`} onClick={() => setTool(t as any)}><Icon name={t==='SELECT'?'MousePointer2':(t==='MOVE'?'Move':(t==='ROTATE'?'RotateCw':'Maximize')) as any} size={14}/></button>)}
                </div>
                <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                    {([
                      { id: 'OBJECT', icon: 'Box', title: 'Object Mode' },
                      { id: 'VERTEX', icon: 'Dot', title: 'Vertex Mode' },
                      { id: 'EDGE', icon: 'Minus', title: 'Edge Mode' },
                      { id: 'FACE', icon: 'Square', title: 'Face Mode' },
                    ] as const).map(m => (
                      <button
                        key={m.id}
                        title={m.title}
                        className={`p-1 hover:text-white rounded ${meshComponentMode===m.id?'text-accent':''}`}
                        onClick={() => localApi.mesh.setComponentMode(m.id)}
                      >
                        <Icon name={m.icon as any} size={14} />
                      </button>
                    ))}
                </div>
                <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex items-center px-2 py-1 text-[10px] text-text-secondary min-w-[100px] justify-between cursor-pointer hover:bg-white/5" onClick={() => setRenderMode(p => (p+1)%3)}>
                    <div className="flex items-center gap-2"><Icon name={renderModeItem.icon as any} size={12} className="text-accent" /><span className="font-semibold text-white/90">{renderModeItem.label}</span></div>
                </div>
                <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                    <button className={`p-1 hover:text-white rounded ${showGrid?'text-accent':''}`} onClick={() => setShowGrid(v=>!v)}><Icon name="Grid" size={14}/></button>
                    <button className={`p-1 hover:text-white rounded ${showWireframe?'text-accent':''}`} onClick={() => setShowWireframe(v=>!v)}><Icon name="Codepen" size={14}/></button>
                    <button className="p-1 hover:text-white rounded" onClick={() => { resetTransform(); focusCamera(); }}><Icon name="Home" size={14}/></button>
                </div>
            </div>

            <div className="absolute top-3 right-3 flex items-center gap-2 z-20 pointer-events-auto">
                <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-text-secondary bg-black/40 px-2 py-1 rounded backdrop-blur border border-white/5">
                    <div><span className="text-accent">{stats.verts}</span> Verts</div><div className="h-3 w-px bg-white/10" />
                    <div><span className="text-accent">{stats.tris}</span> Tris</div><div className="h-3 w-px bg-white/10" />
                    <div><span className="text-accent">{meshComponentMode}</span></div>
                </div>
            </div>

            <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20 pointer-events-none">
                <span>Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}</span>
            </div>

            {pieMenuState && createPortal(
                <PieMenu 
                    x={pieMenuState.x} 
                    y={pieMenuState.y} 
                    currentMode={meshComponentMode} 
                    onSelectMode={(m) => { localApi.mesh.setComponentMode(m); closePieMenu(); }} 
                    onAction={handlePieAction} 
                    onClose={closePieMenu} 
                />, 
                document.body
            )}
        </div>
      </div>
      <div className="w-[320px] shrink-0 border-l border-white/5 bg-[#111111]">
        <AssetViewportOptionsPanel
            tool={tool} setTool={setTool}
            meshComponentMode={meshComponentMode} setMeshComponentMode={(m) => localApi.mesh.setComponentMode(m)}
            uiConfig={uiConfig} setUiConfig={setUiConfig}
            showVertexOverlay={showVertexOverlay} setShowVertexOverlay={setShowVertexOverlay}
            softSelectionEnabled={softSelectionEnabled} setSoftSelectionEnabled={setSoftSelectionEnabled}
            softSelectionRadius={softSelectionRadius} setSoftSelectionRadius={setSoftSelectionRadius}
            softSelectionMode={softSelectionMode} setSoftSelectionMode={setSoftSelectionMode}
            softSelectionFalloff={softSelectionFalloff} setSoftSelectionFalloff={setSoftSelectionFalloff}
            softSelectionHeatmapVisible={softSelectionHeatmapVisible} setSoftSelectionHeatmapVisible={setSoftSelectionHeatmapVisible}
            skeletonViz={skeletonViz} setSkeletonViz={setSkeletonViz}
            transformSpace={transformSpace} setTransformSpace={setTransformSpace}
            snapSettings={snapSettings} setSnapSettings={setSnapSettings}
        />
      </div>
    </div>
  );
};
