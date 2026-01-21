
import React, { useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { useViewportSize } from '@/editor/hooks/useViewportSize';
import { useBrushInteraction } from '@/editor/hooks/useBrushInteraction';
import { EditorContext, EditorContextType, DEFAULT_UI_CONFIG, DEFAULT_SKELETON_VIZ, DEFAULT_SNAP_CONFIG } from '@/editor/state/EditorContext';
import { AssetViewportEngine } from '@/editor/viewports/AssetViewportEngine';
import { useAssetViewportState } from '@/editor/viewports/useAssetViewportState';

import { assetManager } from '@/engine/AssetManager';
import { GizmoSystem } from '@/engine/GizmoSystem';
import { GizmoRenderer } from '@/engine/renderers/GizmoRenderer';
import { Mat4Utils, Vec3Utils, AABBUtils } from '@/engine/math';
import { MeshComponentMode, StaticMeshAsset, SkeletalMeshAsset, ToolType, TransformSpace, SnapSettings } from '@/types';
import { consoleService } from '@/engine/Console';
import { EngineAPI, EngineCommands, EngineQueries, EngineEvents } from '@/engine/api/types';
import { EngineProvider } from '@/engine/api/EngineProvider';

import { Icon } from './Icon';
import { PieMenu } from './PieMenu';
import { AssetViewportOptionsPanel } from './AssetViewportOptionsPanel';
import { usePieMenuInteraction, InteractionAPI } from '@/editor/hooks/usePieMenuInteraction';

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
            focus: () => { log(`selection.focus`, []); api.selection.focus(); },
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

  const toolRef = useRef(tool);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const meshComponentModeRef = useRef(meshComponentMode);
  useEffect(() => { meshComponentModeRef.current = meshComponentMode; }, [meshComponentMode]);
  const uiConfigRef = useRef(effectiveUiConfig);
  useEffect(() => { uiConfigRef.current = effectiveUiConfig; }, [effectiveUiConfig]);

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

  // Sync Skeleton Options to Local Engine
  useEffect(() => {
      if (previewEngineRef.current) {
          previewEngineRef.current.skeletonTool.setOptions(skeletonVizLocal);
      }
  }, [skeletonVizLocal]);

  // Sync UI Config to Local Engine
  useEffect(() => {
      if (previewEngineRef.current) {
          previewEngineRef.current.uiConfig = effectiveUiConfig;
      }
  }, [effectiveUiConfig]);

  // --- LOCAL API ADAPTER ---
  const focusCamera = useCallback(() => {
    const engine = previewEngineRef.current;
    if (!engine || !assetId) return;

    const asset = assetManager.getAsset(assetId) as StaticMeshAsset | SkeletalMeshAsset;
    if (!asset) return;

    // 1. Check for sub-selection (vertex/edge/face) AABB via system
    const selectionBounds = engine.selectionSystem.getSelectionAABB();
    
    if (selectionBounds) {
        // 2. Focus on current sub-selection AABB
        const center = AABBUtils.center(selectionBounds, { x: 0, y: 0, z: 0 });
        const size = AABBUtils.size(selectionBounds, { x: 0, y: 0, z: 0 });
        const maxDim = Math.max(size.x, Math.max(size.y, size.z));
        
        setCamera(p => ({
            ...p,
            target: center,
            radius: Math.max(maxDim * 1.8, 0.2) // framed slightly wider for context
        }));
    } else {
        // 3. Fallback to whole asset framing
        if (fitCameraRef.current) {
            setCamera(p => ({ ...p, ...fitCameraRef.current! }));
        } else {
            setCamera(p => ({ ...p, radius: 3, target: { x: 0, y: 0, z: 0 } }));
        }
    }
  }, [assetId]);

  const resetTransform = () => { previewEngineRef.current?.resetPreviewTransform(); };

  // Memoize and Wrap for Logging (Interaction API)
  const localInteractionApi = useMemo<InteractionAPI>(() => {
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
                  
                  if (mode === 'VERTEX' || mode === 'UV') {
                      engine.clearDeformation();
                      const hits = engine.selectionSystem.selectVerticesInRect(rect.x, rect.y, rect.w, rect.h);
                      const type = mode === 'UV' ? 'UV' : 'VERTEX';
                      engine.selectionSystem.modifySubSelection(type, hits, action === 'ADD' ? 'ADD' : 'SET');
                      engine.notifyUI();
                  } else if (mode === 'OBJECT') {
                      const hits = engine.selectionSystem.selectEntitiesInRect(rect.x, rect.y, rect.w, rect.h);
                      engine.selectionSystem.setSelected(hits);
                      engine.notifyUI();
                  }
              },
              focus: () => focusCamera()
          },
          mesh: {
              setComponentMode: (m) => {
                  if (previewEngineRef.current) previewEngineRef.current.meshComponentMode = m;
                  setMeshComponentMode(m);
              }
          },
          scene: {
              deleteEntity: () => console.warn("Cannot delete preview asset entity"),
              duplicateEntity: () => resetTransform()
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
  }, [setMeshComponentMode, setSoftSelectionEnabled, setSoftSelectionRadius, setSoftSelectionHeatmapVisible, focusCamera]);

  // Full EngineAPI Adapter
  const localEngineApi = useMemo<EngineAPI>(() => {
      // Mock command proxy structure
      const commands: Partial<EngineCommands> = {
          selection: {
              setSelected: localInteractionApi.selection.setSelected,
              clear: localInteractionApi.selection.clear,
              modifySubSelection: localInteractionApi.selection.modifySubSelection,
              clearSubSelection: localInteractionApi.selection.clear,
              selectLoop: localInteractionApi.selection.selectLoop,
              selectInRect: localInteractionApi.selection.selectInRect,
              focus: localInteractionApi.selection.focus
          },
          mesh: {
              setComponentMode: (m) => localInteractionApi.mesh.setComponentMode(m),
              updateAssetGeometry: (aId, geom) => {
                  // Direct update via asset manager, then notify local engine
                  const asset = assetManager.getAsset(aId);
                  if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                      const meshAsset = asset as StaticMeshAsset;
                      if (geom.vertices) meshAsset.geometry.vertices = geom.vertices;
                      if (geom.normals) meshAsset.geometry.normals = geom.normals;
                      if (geom.uvs) meshAsset.geometry.uvs = geom.uvs;
                      if (geom.indices) meshAsset.geometry.indices = geom.indices;
                      
                      if (previewEngineRef.current && previewEngineRef.current.entityId) {
                          previewEngineRef.current.notifyMeshGeometryChanged(previewEngineRef.current.entityId);
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
                  if (previewEngineRef.current) {
                      previewEngineRef.current.skeletonTool.setOptions(options);
                      previewEngineRef.current.notifyUI();
                  }
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
          selection: {
              getSelectedIds: () => previewEngineRef.current?.selectionSystem.selectedIndices.size ? Array.from(previewEngineRef.current.selectionSystem.selectedIndices).map(String) : [],
              getSubSelection: () => previewEngineRef.current?.selectionSystem.subSelection || { vertexIds: new Set(), edgeIds: new Set(), faceIds: new Set(), uvIds: new Set() },
              getSubSelectionStats: () => {
                  const sub = previewEngineRef.current?.selectionSystem.subSelection;
                  return {
                      vertexCount: sub?.vertexIds.size || 0,
                      edgeCount: sub?.edgeIds.size || 0,
                      faceCount: sub?.faceIds.size || 0,
                      uvCount: sub?.uvIds.size || 0,
                      lastVertex: sub?.vertexIds.size ? Array.from(sub.vertexIds).pop() ?? null : null,
                      lastFace: sub?.faceIds.size ? Array.from(sub.faceIds).pop() ?? null : null,
                  };
              }
          },
          mesh: {
              getAssetByEntity: (eid) => {
                  // Local engine only has preview entity
                  if (previewEngineRef.current && previewEngineRef.current.entityId === eid) {
                      return assetManager.getAsset(assetId);
                  }
                  return null;
              }
          },
          skeleton: {
              getOptions: () => previewEngineRef.current?.skeletonTool.getOptions() || DEFAULT_SKELETON_VIZ
          },
          simulation: {
              getMode: () => 'STOPPED',
              isPlaying: () => false,
              getMetrics: () => ({ fps: 60, frameTime: 16, drawCalls: 1, triangleCount: stats.tris, entityCount: 1 })
          }
      } as any;

      return {
          commands: commands as EngineCommands,
          queries: queries as EngineQueries,
          subscribe: (event: any, cb: any) => {
              const engine = previewEngineRef.current;
              if (engine) {
                  engine.events.on(event, cb);
                  return () => engine.events.off(event, cb);
              }
              return () => {};
          }
      };
  }, [localInteractionApi, assetId, stats]);

  // Construct a local EditorContext that overrides global state
  const localEditorContext = useMemo<EditorContextType>(() => {
      // If we have a global context, start with it to fill in gaps (like grid config if not overridden)
      // but override all interaction state.
      const base = editorCtx || {} as any;
      
      return {
          ...base,
          entities: [], // Not really used in static mesh mode
          sceneGraph: previewEngineRef.current?.sceneGraph as any,
          selectedIds: previewEngineRef.current?.selectionSystem.selectedIndices.size ? [previewEngineRef.current?.entityId!] : [],
          setSelectedIds: (ids) => localInteractionApi.selection.setSelected(ids),
          selectedAssetIds: [assetId],
          setSelectedAssetIds: () => {},
          
          tool,
          setTool,
          meshComponentMode,
          setMeshComponentMode,
          
          transformSpace: transformSpaceLocal,
          setTransformSpace: setTransformSpaceLocal,
          
          snapSettings: snapSettingsLocal,
          setSnapSettings: setSnapSettingsLocal,
          
          skeletonViz: skeletonVizLocal,
          setSkeletonViz: setSkeletonVizLocal,
          
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
          
          uiConfig: effectiveUiConfig,
          setUiConfig: setEffectiveUiConfig,
      };
  }, [
      editorCtx, localInteractionApi, assetId, 
      tool, meshComponentMode, transformSpaceLocal, snapSettingsLocal, skeletonVizLocal,
      softSelectionEnabled, softSelectionRadius, softSelectionMode, softSelectionFalloff, softSelectionHeatmapVisible,
      effectiveUiConfig, selectionTick // Rerender when engine notifies
  ]);

  // --- PIE MENU HOOK ---
  const { pieMenuState, openPieMenu, closePieMenu, handlePieAction } = usePieMenuInteraction({
      sceneGraph: previewEngineRef.current?.sceneGraph as any,
      selectedIds: previewEngineRef.current?.getPreviewEntityId() ? [previewEngineRef.current?.getPreviewEntityId()!] : [],
      onSelect: () => {}, // Selection is fixed in asset viewer
      setTool,
      setMeshComponentMode,
      handleFocus: () => localInteractionApi.selection.focus(),
      handleModeSelect: (id) => setRenderMode(id),
      api: localInteractionApi 
  });

  const { isBrushKeyHeld, isAdjustingBrush } = useBrushInteraction({
    scopeRef: containerRef,
    isBrushContextEnabled: () => meshComponentModeRef.current !== 'OBJECT',
    onBrushAdjustEnd: () => previewEngineRef.current?.endVertexDrag(),
    brushState: {
      enabled: softSelectionEnabled, 
      setEnabled: (v) => localInteractionApi.sculpt?.setEnabled(v),
      radius: softSelectionRadius, 
      setRadius: (v) => localInteractionApi.sculpt?.setRadius(v),
      heatmapVisible: softSelectionHeatmapVisible, 
      setHeatmapVisible: (v) => localInteractionApi.sculpt?.setHeatmapVisible(v),
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
             localInteractionApi.selection.setSelected([id]);
        }
    }
  }, [meshComponentMode, localInteractionApi]);

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
      if (e.key === 'f') localInteractionApi.selection.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTool, localInteractionApi]);

  useEffect(() => {
    const asset = assetManager.getAsset(assetId);
    if (!asset || (asset.type === 'FOLDER' || asset.type === 'MATERIAL' || asset.type === 'PHYSICS_MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG' || asset.type === 'SCENE' || asset.type === 'TEXTURE' || asset.type === 'SKELETON')) return;

    const meshAsset = asset as StaticMeshAsset | SkeletalMeshAsset;
    setStats({ verts: meshAsset.geometry.vertices.length / 3, tris: meshAsset.geometry.indices.length / 3 });
    const fit = computeFitCamera(meshAsset);
    fitCameraRef.current = fit;
    setCamera(p => ({ ...p, radius: fit.radius, target: { ...fit.target } }));

    const engine = new AssetViewportEngine(
      () => setSelectionTick(p => p + 1),
      () => {}, 
      () => setStats({ verts: meshAsset.geometry.vertices.length/3, tris: meshAsset.geometry.indices.length/3 })
    );
    
    engine.meshComponentMode = meshComponentMode;
    engine.softSelectionEnabled = softSelectionEnabled;
    engine.softSelectionRadius = softSelectionRadius;
    engine.softSelectionMode = softSelectionMode;
    engine.softSelectionFalloff = softSelectionFalloff;
    engine.softSelectionHeatmapVisible = softSelectionHeatmapVisible;
    engine.uiConfig = effectiveUiConfig;

    engine.setPreviewMesh(assetId);
    engine.syncTransforms(false);
    
    // Apply skeleton options on init
    engine.skeletonTool.setOptions(skeletonVizLocal);

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
    engine.uiConfig = effectiveUiConfig;
    engine.recalculateSoftSelection(true);
  }, [assetId, meshComponentMode, softSelectionEnabled, softSelectionRadius, softSelectionMode, softSelectionFalloff, softSelectionHeatmapVisible, effectiveUiConfig]);

  useEffect(() => {
    const asset = assetManager.getAsset(assetId);
    if (!asset || (asset.type === 'FOLDER' || asset.type === 'MATERIAL' || asset.type === 'PHYSICS_MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG' || asset.type === 'SCENE' || asset.type === 'TEXTURE' || asset.type === 'SKELETON')) return;

    const meshAsset = asset as StaticMeshAsset | SkeletalMeshAsset;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!gl) return;

    previewEngineRef.current?.initGL(gl);

    const gizmoRenderer = new GizmoRenderer(); gizmoRenderer.init(gl);
    
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
              if (hit) localInteractionApi.selection.setSelected([hit]);
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
                      localInteractionApi.selection.setSelected([engine.entityId]);
                  }

                  let action: 'SET' | 'TOGGLE' = 'SET';
                  if (e.shiftKey) action = 'TOGGLE';

                  if (meshComponentMode === 'VERTEX') {
                      localInteractionApi.selection.modifySubSelection('VERTEX', [picked.vertexId], action);
                  } else if (meshComponentMode === 'EDGE') {
                      const key = picked.edgeId.sort((a,b)=>a-b).join('-');
                      localInteractionApi.selection.modifySubSelection('EDGE', [key], action);
                  } else if (meshComponentMode === 'FACE') {
                      localInteractionApi.selection.modifySubSelection('FACE', [picked.faceId], action);
                  } else if (meshComponentMode === 'UV') {
                      localInteractionApi.selection.modifySubSelection('UV', [picked.vertexId], action);
                  }
                  return;
              }
              
              setSelectionBox({ isSelecting: true, startX: mx, startY: my, currentX: mx, currentY: my, mode: meshComponentMode });
              return;
          }
          
          const hitId = engine.selectionSystem.selectEntityAt(mx, my, rect.width, rect.height);
          if (hitId) { 
              localInteractionApi.selection.setSelected([hitId]); 
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
           if ((meshComponentModeRef.current === 'VERTEX' || meshComponentModeRef.current === 'UV') && previewEngineRef.current) {
                previewEngineRef.current.selectionSystem.selectVerticesInBrush(mx, my, rect.width, rect.height, !e.ctrlKey);
           }
      }

      if (selectionBoxRef.current?.isSelecting) {
          setSelectionBox(prev => prev ? ({ ...prev, currentX: mx, currentY: my }) : null);
      }

      gizmoSystemRef.current?.update(0, mx, my, rect.width, rect.height, false, false);
      if (meshComponentModeRef.current === 'VERTEX' || meshComponentModeRef.current === 'UV') {
          previewEngineRef.current?.selectionSystem.highlightVertexAt(mx, my, rect.width, rect.height);
      }

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
             localInteractionApi.selection.selectInRect(
                 { x, y, w, h }, 
                 sb.mode, 
                 e.shiftKey ? 'ADD' : 'SET'
             );
          } else {
             if (!e.shiftKey) {
                 if (sb.mode !== 'OBJECT') {
                     if (sb.mode === 'VERTEX') localInteractionApi.selection.modifySubSelection('VERTEX', [], 'SET');
                     else if (sb.mode === 'EDGE') localInteractionApi.selection.modifySubSelection('EDGE', [], 'SET');
                     else if (sb.mode === 'FACE') localInteractionApi.selection.modifySubSelection('FACE', [], 'SET');
                     else if (sb.mode === 'UV') localInteractionApi.selection.modifySubSelection('UV', [], 'SET');
                 } else {
                     localInteractionApi.selection.clear();
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
    <EditorContext.Provider value={localEditorContext}>
        <EngineProvider api={localEngineApi}>
            <div className="flex h-full bg-[#151515] select-none text-xs">
              <div className="flex-1 flex flex-col">
                {/* Toolbar */}
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
                          { id: 'UV', icon: 'LayoutGrid', title: 'UV Mode' },
                        ] as const).map(m => (
                          <button
                            key={m.id}
                            title={m.title}
                            className={`p-1 hover:text-white rounded ${meshComponentMode===m.id?'text-accent':''}`}
                            onClick={() => localInteractionApi.mesh.setComponentMode(m.id)}
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
                        <button className="p-1 hover:text-white rounded" onClick={() => { resetTransform(); localInteractionApi.selection.focus(); }}><Icon name="Home" size={14}/></button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 relative overflow-hidden bg-[#151515]">
                    <div ref={containerRef} className={`w-full h-full relative overflow-hidden ${dragState ? 'cursor-grabbing' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={(e) => setCamera(p => ({...p, radius: Math.max(0.25, p.radius + e.deltaY * 0.01)}))} onContextMenu={e => e.preventDefault()}>
                        <canvas ref={canvasRef} className="w-full h-full block relative z-10" />
                        {selectionBox && selectionBox.isSelecting && <div className="absolute z-20 pointer-events-none border-2 border-[#4f80f8] bg-[#4f80f8]/20" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
                        
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
                                onSelectMode={(m) => { localInteractionApi.mesh.setComponentMode(m); closePieMenu(); }} 
                                onAction={handlePieAction} 
                                onClose={closePieMenu} 
                            />, 
                            document.body
                        )}
                    </div>
                </div>
              </div>
              
              {/* Side Panel */}
              <div className="w-[320px] shrink-0 border-l border-white/5 bg-[#111111]">
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
              </div>
            </div>
        </EngineProvider>
    </EditorContext.Provider>
  );
};
