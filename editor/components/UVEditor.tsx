
import React, { useRef, useEffect, useState, useContext, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useViewportSize, resizeCanvasToViewport } from '@/editor/hooks/useViewportSize';
import { EditorContext } from '@/editor/state/EditorContext';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { EngineAPI } from '@/engine/api/types';
import { Icon } from './Icon';
import { PieMenu } from './PieMenu';
import { usePieMenuInteraction, InteractionAPI } from '@/editor/hooks/usePieMenuInteraction';
import { StaticMeshAsset, SkeletalMeshAsset, MeshComponentMode } from '@/types';
import { assetManager } from '@/engine/AssetManager';

type NavState = {
  mode: 'PAN' | 'ZOOM' | 'NONE';
  startX: number;
  startY: number;
  startTransform: { x: number; y: number; k: number };
};

type SelectionBox = {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
};

interface UVEditorProps {
    api?: EngineAPI; // Optional: Override API for local contexts (e.g. Static Mesh Editor)
    assetId?: string; // Optional: Specific asset to edit, overriding global selection
}

export const UVEditor: React.FC<UVEditorProps> = ({ api: overrideApi, assetId: overrideAssetId }) => {
    const ctx = useContext(EditorContext);
    const globalApi = useEngineAPI();
    const api = overrideApi || globalApi;
    
    // Access global UI config, or default if missing
    const uiConfig = ctx?.uiConfig || { 
        vertexColor: '#a855f7', 
        selectionEdgeColor: '#4f80f8', 
        vertexSize: 1.0, 
        showVertexOverlay: true,
        selectionEdgeHighlight: true 
    } as any;
    
    const selectedAssetIds = ctx?.selectedAssetIds || [];
    const selectedEntityIds = ctx?.selectedIds || [];
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportSize = useViewportSize(containerRef, { dprCap: 2 });
    
    const [transform, setTransform] = useState({ x: 50, y: 50, k: 300 }); 
    const transformRef = useRef(transform);
    useEffect(() => { transformRef.current = transform; }, [transform]);

    // Sub-selection state synced with engine
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
    const [selectedFaces, setSelectedFaces] = useState<Set<number>>(new Set());
    
    const [selectionMode, setSelectionMode] = useState<MeshComponentMode>('VERTEX');
    const [selectedVertex, setSelectedVertex] = useState<number>(-1); // For primary selection overlay
    
    const [navState, setNavState] = useState<NavState>({ mode: 'NONE', startX: 0, startY: 0, startTransform: { ...transform } });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [isDraggingVertex, setIsDraggingVertex] = useState(false);
    
    const [editingAsset, setEditingAsset] = useState<StaticMeshAsset | SkeletalMeshAsset | null>(null);
    const [uvBuffer, setUvBuffer] = useState<Float32Array | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // --- Selection Sync ---
    const syncFromEngine = useCallback(() => {
        const sub = api.queries.selection.getSubSelection();
        setSelectedIndices(new Set(sub.vertexIds));
        setSelectedEdges(new Set(sub.edgeIds));
        setSelectedFaces(new Set(sub.faceIds));
    }, [api]);

    useEffect(() => {
        syncFromEngine();
        const unsub1 = api.subscribe('selection:changed', syncFromEngine);
        const unsub2 = api.subscribe('selection:subChanged', syncFromEngine);
        return () => { unsub1(); unsub2(); };
    }, [api, syncFromEngine]);

    // --- Asset Loading ---
    useEffect(() => {
        let asset: StaticMeshAsset | SkeletalMeshAsset | null = null;
        
        if (overrideAssetId) {
            const a = assetManager.getAsset(overrideAssetId);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        } else if (selectedAssetIds.length > 0) {
            const a = assetManager.getAsset(selectedAssetIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        } else if (selectedEntityIds.length > 0) {
            const a = api.queries.mesh.getAssetByEntity(selectedEntityIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        }
        
        if (asset && asset.id !== editingAsset?.id) {
            setEditingAsset(asset);
            setUvBuffer(new Float32Array(asset.geometry.uvs));
            setSelectedVertex(-1);
        } else if (!asset) {
            setEditingAsset(null);
            setUvBuffer(null);
        }
    }, [overrideAssetId, selectedAssetIds, selectedEntityIds, editingAsset?.id, api]);

    // --- Camera Focus ---
    const focusOnSelection = useCallback(() => {
        const { cssWidth, cssHeight } = viewportSize;

        if (!uvBuffer || !editingAsset) {
            setTransform({ x: cssWidth / 2 - 150, y: cssHeight / 2 - 150, k: 300 });
            return;
        }

        const indices = Array.from(selectedIndices) as number[];
        
        if (indices.length > 0) {
            let minU: number = Infinity;
            let minV: number = Infinity;
            let maxU: number = -Infinity;
            let maxV: number = -Infinity;

            for (const idx of indices) {
                const u = uvBuffer[idx * 2];
                const v = uvBuffer[idx * 2 + 1];
                minU = Math.min(minU, u); maxU = Math.max(maxU, u);
                minV = Math.min(minV, v); maxV = Math.max(maxV, v);
            }

            const centerU = (minU + maxU) / 2;
            const centerV = (minV + maxV) / 2;
            const sizeU = maxU - minU;
            const sizeV = maxV - minV;
            const maxSize = Math.max(sizeU, sizeV, 0.01);

            const padding = 1.4;
            const newK = Math.min(cssWidth, cssHeight) / (maxSize * padding);
            
            setTransform({
                x: cssWidth / 2 - centerU * newK,
                y: cssHeight / 2 - (1 - centerV) * newK,
                k: newK
            });
        } else {
            const margin = 50;
            const availableW = cssWidth - margin * 2;
            const availableH = cssHeight - margin * 2;
            const newK = Math.min(availableW, availableH);
            setTransform({
                x: (cssWidth - newK) / 2,
                y: (cssHeight - newK) / 2,
                k: newK
            });
        }
    }, [uvBuffer, editingAsset, selectedIndices, viewportSize]);

    // --- Local API for Pie Menu ---
    const localApi = useMemo<InteractionAPI>(() => ({
        selection: {
            selectLoop: (mode) => api.commands.selection.selectLoop(mode),
            modifySubSelection: (type, ids, action) => api.commands.selection.modifySubSelection(type, ids, action),
            setSelected: (ids) => api.commands.selection.setSelected(ids),
            clear: () => api.commands.selection.clearSubSelection(),
            selectInRect: (rect, mode, action) => api.commands.selection.selectInRect(rect, mode, action),
            focus: () => focusOnSelection()
        },
        mesh: {
            setComponentMode: (mode) => {
                setSelectionMode(mode);
                api.commands.mesh.setComponentMode(mode);
            }
        },
        scene: {
            deleteEntity: () => {},
            duplicateEntity: () => {}
        },
        modeling: {
            extrudeFaces: () => api.commands.modeling.extrudeFaces(),
            bevelEdges: () => api.commands.modeling.bevelEdges(),
            weldVertices: () => api.commands.modeling.weldVertices(),
            connectComponents: () => api.commands.modeling.connectComponents(),
            deleteSelectedFaces: () => api.commands.modeling.deleteSelectedFaces(),
        }
    }), [api, focusOnSelection]);

    // --- Pie Menu Hook ---
    const { 
        pieMenuState, 
        openPieMenu, 
        closePieMenu, 
        handlePieAction 
    } = usePieMenuInteraction({
        sceneGraph: ctx?.sceneGraph as any,
        selectedIds: selectedEntityIds,
        onSelect: (ids) => api.commands.selection.setSelected(ids),
        setTool: (t) => ctx?.setTool(t),
        setMeshComponentMode: (m) => {
            setSelectionMode(m);
            api.commands.mesh.setComponentMode(m);
        },
        handleFocus: focusOnSelection,
        handleModeSelect: () => {}, 
        api: localApi
    });

    // --- Keyboard Handling ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT') return;
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); focusOnSelection(); }
            if (e.key === '1') localApi.mesh.setComponentMode('VERTEX');
            if (e.key === '2') localApi.mesh.setComponentMode('EDGE');
            if (e.key === '3') localApi.mesh.setComponentMode('FACE');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusOnSelection, localApi]);

    // --- Rendering ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        resizeCanvasToViewport(canvas, viewportSize);
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d || !uvBuffer) return;

        ctx2d.setTransform(viewportSize.dpr, 0, 0, viewportSize.dpr, 0, 0);
        ctx2d.fillStyle = '#0a0a0a';
        ctx2d.fillRect(0, 0, viewportSize.cssWidth, viewportSize.cssHeight);

        const { x, y, k } = transform;
        const toX = (u: number) => x + u * k;
        const toY = (v: number) => y + (1 - v) * k;

        // 1. Grid
        ctx2d.strokeStyle = '#222'; ctx2d.lineWidth = 1;
        for(let i=0; i<=10; i++) {
            const t = i/10;
            const isMajor = i === 0 || i === 10;
            ctx2d.beginPath();
            ctx2d.strokeStyle = isMajor ? '#444' : '#1a1a1a';
            ctx2d.moveTo(toX(t), toY(0)); ctx2d.lineTo(toX(t), toY(1));
            ctx2d.moveTo(toX(0), toY(t)); ctx2d.lineTo(toX(1), toY(t));
            ctx2d.stroke();
        }

        // 2. Mesh Connectivity
        if (editingAsset?.topology) {
            editingAsset.topology.faces.forEach((face, fIdx) => {
                if (face.length < 3) return;

                // Highlight Selected Faces
                if (selectedFaces.has(fIdx)) {
                    ctx2d.fillStyle = 'rgba(79, 128, 248, 0.25)'; // Keep hardcoded semi-transparent selection for faces
                    ctx2d.beginPath();
                    ctx2d.moveTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                    for(let i=1; i<face.length; i++) ctx2d.lineTo(toX(uvBuffer[face[i]*2]), toY(uvBuffer[face[i]*2+1]));
                    ctx2d.closePath();
                    ctx2d.fill();
                }

                // Draw Edges
                ctx2d.beginPath();
                ctx2d.strokeStyle = '#4f80f8';
                ctx2d.lineWidth = 0.5;
                for(let i=0; i<face.length; i++) {
                    const v1 = face[i];
                    const v2 = face[(i+1)%face.length];
                    const edgeKey = [v1, v2].sort((a,b)=>a-b).join('-');
                    
                    const isEdgeSelected = selectedEdges.has(edgeKey);
                    if (isEdgeSelected) {
                        ctx2d.save();
                        ctx2d.strokeStyle = '#fbbf24'; // Edge selection stays distinct (gold) or could be selectionColor
                        ctx2d.lineWidth = 2.0;
                        ctx2d.beginPath();
                        ctx2d.moveTo(toX(uvBuffer[v1*2]), toY(uvBuffer[v1*2+1]));
                        ctx2d.lineTo(toX(uvBuffer[v2*2]), toY(uvBuffer[v2*2+1]));
                        ctx2d.stroke();
                        ctx2d.restore();
                    } else {
                        ctx2d.moveTo(toX(uvBuffer[v1*2]), toY(uvBuffer[v1*2+1]));
                        ctx2d.lineTo(toX(uvBuffer[v2*2]), toY(uvBuffer[v2*2+1]));
                    }
                }
                ctx2d.stroke();
            });
        }

        // 3. Vertices (Synced Visuals)
        // Scale vertex size based on shared config
        const vSize = Math.max(3, (uiConfig.vertexSize || 1.0) * 3);
        const selSize = vSize * 1.5;
        const primSize = vSize * 2.0;

        for(let i=0; i<uvBuffer.length/2; i++) {
            const isSel = selectedIndices.has(i);
            const isPrimary = i === selectedVertex;
            
            if (isPrimary) {
                ctx2d.fillStyle = '#ffffff';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - primSize/2, toY(uvBuffer[i*2+1]) - primSize/2, primSize, primSize);
            } else if (isSel) {
                ctx2d.fillStyle = uiConfig.selectionEdgeColor || '#4f80f8';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - selSize/2, toY(uvBuffer[i*2+1]) - selSize/2, selSize, selSize);
            } else if (selectionMode === 'VERTEX' || uiConfig.showVertexOverlay) {
                ctx2d.fillStyle = uiConfig.vertexColor || '#a855f7';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - vSize/2, toY(uvBuffer[i*2+1]) - vSize/2, vSize, vSize);
            }
        }
    }, [editingAsset, uvBuffer, transform, selectedIndices, selectedEdges, selectedFaces, selectionMode, selectedVertex, viewportSize, uiConfig]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

        if (pieMenuState && e.button !== 2) { closePieMenu(); return; }

        // Navigation
        if (e.altKey || e.button === 1 || e.button === 2) {
            if (e.button === 2 && !e.altKey) {
                openPieMenu(e.clientX, e.clientY);
                return;
            }
            let mode: NavState['mode'] = 'PAN';
            if (e.button === 2 || (e.altKey && e.shiftKey)) mode = 'ZOOM';
            setNavState({ mode, startX: e.clientX, startY: e.clientY, startTransform: { ...transform } });
            return;
        }

        // Selection / Picking
        if (e.button === 0 && uvBuffer && editingAsset) {
            let closest = -1; let minDst = 12;
            for (let i = 0; i < uvBuffer.length / 2; i++) {
                const px = transform.x + uvBuffer[i*2] * transform.k;
                const py = transform.y + (1 - uvBuffer[i*2+1]) * transform.k;
                const dst = Math.sqrt((mx - px)**2 + (my - py)**2);
                if (dst < minDst) { minDst = dst; closest = i; }
            }

            if (closest !== -1) {
                const action = e.shiftKey ? 'TOGGLE' : 'SET';
                api.commands.selection.modifySubSelection('VERTEX', [closest], action);
                setSelectedVertex(closest);
                setIsDraggingVertex(true);
            } else {
                // Background click -> Start Marquee Selection
                setSelectionBox({
                    startX: mx,
                    startY: my,
                    currentX: mx,
                    currentY: my,
                    isSelecting: true
                });
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

        if (navState.mode !== 'NONE') {
            const dx = e.clientX - navState.startX;
            const dy = e.clientY - navState.startY;

            if (navState.mode === 'PAN') {
                setTransform({ ...navState.startTransform, x: navState.startTransform.x + dx, y: navState.startTransform.y + dy });
            } else if (navState.mode === 'ZOOM') {
                const zoomFactor = Math.exp((dx - dy) * 0.01);
                const newK = Math.max(10, navState.startTransform.k * zoomFactor);
                const cx = viewportSize.cssWidth / 2; const cy = viewportSize.cssHeight / 2;
                const wx = (cx - navState.startTransform.x) / navState.startTransform.k;
                const wy = (cy - navState.startTransform.y) / navState.startTransform.k;
                setTransform({ x: cx - wx * newK, y: cy - wy * newK, k: newK });
            }
            return;
        }

        if (selectionBox?.isSelecting) {
            setSelectionBox(prev => prev ? { ...prev, currentX: mx, currentY: my } : null);
            return;
        }

        if (isDraggingVertex && selectedIndices.size > 0 && uvBuffer) {
            const du = e.movementX / transform.k; const dv = -e.movementY / transform.k;
            const newBuf = new Float32Array(uvBuffer);
            selectedIndices.forEach((idx: number) => { newBuf[idx*2] += du; newBuf[idx*2+1] += dv; });
            setUvBuffer(newBuf);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (selectionBox?.isSelecting && uvBuffer) {
            const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
            const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
            const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
            const y2 = Math.max(selectionBox.startY, selectionBox.currentY);
            const w = x2 - x1;
            const h = y2 - y1;

            if (w > 2 || h > 2) {
                const capturedIndices: number[] = [];
                const capturedEdges: string[] = [];
                const capturedFaces: number[] = [];

                // 1. Capture Vertices
                for (let i = 0; i < uvBuffer.length / 2; i++) {
                    const px = transform.x + uvBuffer[i * 2] * transform.k;
                    const py = transform.y + (1 - uvBuffer[i * 2 + 1]) * transform.k;
                    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) capturedIndices.push(i);
                }

                // 2. Capture Edges/Faces based on topology if available
                if (editingAsset?.topology) {
                    if (selectionMode === 'EDGE') {
                        editingAsset.topology.faces.forEach(face => {
                            for (let i = 0; i < face.length; i++) {
                                const v1 = face[i];
                                const v2 = face[(i + 1) % face.length];
                                const p1 = { x: transform.x + uvBuffer[v1 * 2] * transform.k, y: transform.y + (1 - uvBuffer[v1 * 2 + 1]) * transform.k };
                                const p2 = { x: transform.x + uvBuffer[v2 * 2] * transform.k, y: transform.y + (1 - uvBuffer[v2 * 2 + 1]) * transform.k };
                                // Check if both vertices of edge are in box
                                if (p1.x >= x1 && p1.x <= x2 && p1.y >= y1 && p1.y <= y2 &&
                                    p2.x >= x1 && p2.x <= x2 && p2.y >= y1 && p2.y <= y2) {
                                    capturedEdges.push([v1, v2].sort((a,b)=>a-b).join('-'));
                                }
                            }
                        });
                    } else if (selectionMode === 'FACE') {
                        editingAsset.topology.faces.forEach((face, fIdx) => {
                            let allIn = true;
                            for (const v of face) {
                                const px = transform.x + uvBuffer[v * 2] * transform.k;
                                const py = transform.y + (1 - uvBuffer[v * 2 + 1]) * transform.k;
                                if (!(px >= x1 && px <= x2 && py >= y1 && py <= y2)) { allIn = false; break; }
                            }
                            if (allIn) capturedFaces.push(fIdx);
                        });
                    }
                }

                const action = e.shiftKey ? 'TOGGLE' : 'SET';
                if (selectionMode === 'VERTEX') api.commands.selection.modifySubSelection('VERTEX', capturedIndices, action);
                else if (selectionMode === 'EDGE') api.commands.selection.modifySubSelection('EDGE', capturedEdges, action);
                else if (selectionMode === 'FACE') api.commands.selection.modifySubSelection('FACE', capturedFaces, action);
            } else if (!e.shiftKey) {
                // Deselect on tiny click
                api.commands.selection.modifySubSelection('VERTEX', [], 'SET');
                setSelectedVertex(-1);
            }
        }

        setNavState({ mode: 'NONE', startX: 0, startY: 0, startTransform: { ...transformRef.current } });
        setSelectionBox(null);
        setIsDraggingVertex(false);
    };

    const saveChanges = async () => {
        if (editingAsset && uvBuffer) {
            setIsSaving(true);
            try {
                api.commands.mesh.updateAssetGeometry(editingAsset.id, { uvs: uvBuffer });
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a] select-none">
            <div className="h-8 bg-panel-header border-b border-white/5 flex items-center px-2 justify-between shrink-0">
                <div className="flex items-center gap-4 text-[10px] text-text-secondary uppercase font-bold tracking-widest">
                    <div className="flex items-center gap-1"><Icon name="LayoutGrid" size={12} className="text-accent" /> UV Editor</div>
                    <div className="flex items-center gap-2 bg-black/20 rounded px-2 py-0.5 border border-white/5">
                        {(['VERTEX', 'EDGE', 'FACE'] as MeshComponentMode[]).map(m => (
                            <button key={m} onClick={() => localApi.mesh.setComponentMode(m)} className={`hover:text-white transition-colors ${selectionMode === m ? 'text-accent' : ''}`}>
                                {m.charAt(0) + m.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={focusOnSelection} className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-colors" title="Focus Selection (F)">
                        <Icon name="Target" size={14} />
                    </button>
                    {editingAsset && (
                        <button onClick={saveChanges} disabled={isSaving} className={`flex items-center gap-1 bg-accent hover:bg-accent-hover text-white text-[10px] px-3 py-1 rounded-full transition-all shadow-lg ${isSaving ? 'opacity-50' : ''}`}>
                            <Icon name={isSaving ? "Loader2" : "Save"} size={10} className={isSaving ? "animate-spin" : ""} />
                            {isSaving ? "Syncing..." : "Apply Changes"}
                        </button>
                    )}
                </div>
            </div>
            <div ref={containerRef} className={`flex-1 relative overflow-hidden bg-[#0a0a0a] ${navState.mode !== 'NONE' ? 'cursor-grabbing' : 'cursor-crosshair'}`} 
                onWheel={(e) => {
                    const rect = containerRef.current!.getBoundingClientRect();
                    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
                    const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1);
                    const newK = Math.max(10, transform.k * zoomFactor);
                    const wx = (mx - transform.x) / transform.k; const wy = (my - transform.y) / transform.k;
                    setTransform({ x: mx - wx * newK, y: my - wy * newK, k: newK });
                }} 
                onMouseDown={handleMouseDown} 
                onMouseMove={handleMouseMove} 
                onMouseUp={handleMouseUp} 
                onMouseLeave={handleMouseUp}
                onContextMenu={e => e.preventDefault()}
            >
                <canvas ref={canvasRef} className="block" />
                
                {selectionBox && selectionBox.isSelecting && (
                    <div className="absolute border border-accent bg-accent/15 pointer-events-none z-30" 
                        style={{ 
                            left: Math.min(selectionBox.startX, selectionBox.currentX), 
                            top: Math.min(selectionBox.startY, selectionBox.currentY), 
                            width: Math.abs(selectionBox.currentX - selectionBox.startX), 
                            height: Math.abs(selectionBox.currentY - selectionBox.startY) 
                        }} 
                    />
                )}

                {navState.mode !== 'NONE' && <div className="absolute inset-0 border-2 border-accent/20 pointer-events-none" />}
                <div className="absolute bottom-2 left-2 flex gap-4 text-[9px] text-text-secondary opacity-50 pointer-events-none bg-black/50 px-2 py-1 rounded border border-white/5">
                    <span>Alt+LMB: Pan</span>
                    <span>Alt+RMB: Zoom</span>
                    <span>Drag: Select Multi</span>
                    <span>R-Click: Pie Menu</span>
                </div>
            </div>

            {pieMenuState && createPortal(
                <PieMenu 
                    x={pieMenuState.x} 
                    y={pieMenuState.y} 
                    currentMode={selectionMode} 
                    onSelectMode={(m) => { localApi.mesh.setComponentMode(m); closePieMenu(); }} 
                    onAction={handlePieAction} 
                    onClose={closePieMenu} 
                />, 
                document.body
            )}
        </div>
    );
};
