import React, { useRef, useEffect, useState, useContext, useCallback } from 'react';
import { useViewportSize, resizeCanvasToViewport } from '@/editor/hooks/useViewportSize';
import { EditorContext } from '@/editor/state/EditorContext';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { Icon } from './Icon';
import { StaticMeshAsset, SkeletalMeshAsset } from '@/types';
// Add missing import for assetManager
import { assetManager } from '@/engine/AssetManager';

type SelectionMode = 'VERTEX' | 'EDGE' | 'FACE';

export const UVEditor: React.FC = () => {
    const ctx = useContext(EditorContext);
    const api = useEngineAPI();
    
    const selectedAssetIds = ctx?.selectedAssetIds || [];
    const selectedEntityIds = ctx?.selectedIds || [];
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportSize = useViewportSize(containerRef, { dprCap: 2 });
    
    const [transform, setTransform] = useState({ x: 50, y: 50, k: 300 }); 
    const [selectedVertex, setSelectedVertex] = useState<number>(-1);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [selectionMode, setSelectionMode] = useState<SelectionMode>('VERTEX');
    
    const [isDragging, setIsDragging] = useState(false);
    const [editingAsset, setEditingAsset] = useState<StaticMeshAsset | SkeletalMeshAsset | null>(null);
    const [uvBuffer, setUvBuffer] = useState<Float32Array | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // --- Asset Loading via API ---
    useEffect(() => {
        let asset: StaticMeshAsset | SkeletalMeshAsset | null = null;
        
        if (selectedAssetIds.length > 0) {
            // Fix: Use assetManager directly as api.assets is not available on EngineAPI
            const a = assetManager.getAsset(selectedAssetIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        } else if (selectedEntityIds.length > 0) {
            const a = api.queries.mesh.getAssetByEntity(selectedEntityIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) asset = a as StaticMeshAsset;
        }
        
        if (asset && asset.id !== editingAsset?.id) {
            setEditingAsset(asset);
            setUvBuffer(new Float32Array(asset.geometry.uvs));
            setSelectedIndices(new Set());
            setSelectedVertex(-1);
        } else if (!asset) {
            setEditingAsset(null);
            setUvBuffer(null);
        }
    }, [selectedAssetIds, selectedEntityIds, editingAsset?.id, api]);

    // --- Focus Feature ---
    const focusOnSelection = useCallback(() => {
        if (!uvBuffer || !editingAsset) {
            // Reset focus to center
            setTransform({ x: viewportSize.cssWidth / 2 - 150, y: viewportSize.cssHeight / 2 - 150, k: 300 });
            return;
        }

        const indicesToFrame = selectedIndices.size > 0 ? Array.from(selectedIndices) : null;
        
        if (indicesToFrame) {
            let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
            // Fix: Use for...of instead of forEach to ensure TypeScript properly narrows uvBuffer (it's not null here)
            // This prevents "left-hand side of an arithmetic operation must be of type..." errors by ensuring the derived values (centerU, etc) are known numbers.
            for (const idx of indicesToFrame) {
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

            // Calculate scale to fit with margin
            const padding = 1.4;
            const newK = Math.min(viewportSize.cssWidth, viewportSize.cssHeight) / (maxSize * padding);
            
            setTransform({
                x: viewportSize.cssWidth / 2 - centerU * newK,
                y: viewportSize.cssHeight / 2 - (1 - centerV) * newK,
                k: newK
            });
        } else {
            // Frame the 0-1 grid
            const margin = 50;
            const availableW = viewportSize.cssWidth - margin * 2;
            const availableH = viewportSize.cssHeight - margin * 2;
            const newK = Math.min(availableW, availableH);
            setTransform({
                x: (viewportSize.cssWidth - newK) / 2,
                y: (viewportSize.cssHeight - newK) / 2,
                k: newK
            });
        }
    }, [uvBuffer, editingAsset, selectedIndices, viewportSize.cssWidth, viewportSize.cssHeight]);

    // --- Keyboard Handling ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT') return;
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                focusOnSelection();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusOnSelection]);

    // --- Rendering ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        resizeCanvasToViewport(canvas, viewportSize);
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        ctx2d.setTransform(viewportSize.dpr, 0, 0, viewportSize.dpr, 0, 0);
        ctx2d.fillStyle = '#101010';
        ctx2d.fillRect(0, 0, viewportSize.cssWidth, viewportSize.cssHeight);

        if (!editingAsset || !uvBuffer) {
            ctx2d.fillStyle = '#444'; ctx2d.font = '12px Inter, sans-serif'; ctx2d.textAlign = 'center';
            ctx2d.fillText("No Mesh Selected", viewportSize.cssWidth/2, viewportSize.cssHeight/2);
            return;
        }

        const { x, y, k } = transform;
        const toX = (u: number) => x + u * k;
        const toY = (v: number) => y + (1 - v) * k;

        // Draw UV Grid (0-1 range)
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

        // Draw Wireframe
        ctx2d.beginPath(); ctx2d.strokeStyle = '#4f80f8'; ctx2d.lineWidth = 0.5;
        if (editingAsset.topology && editingAsset.topology.faces.length > 0) {
            editingAsset.topology.faces.forEach(face => {
                if (face.length < 3) return;
                ctx2d.moveTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                for (let i = 1; i < face.length; i++) {
                    ctx2d.lineTo(toX(uvBuffer[face[i]*2]), toY(uvBuffer[face[i]*2+1]));
                }
                ctx2d.lineTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
            });
        } else {
            const idx = editingAsset.geometry.indices;
            for(let i=0; i<idx.length; i+=3) {
                const i1 = idx[i], i2 = idx[i+1], i3 = idx[i+2];
                ctx2d.moveTo(toX(uvBuffer[i1*2]), toY(uvBuffer[i1*2+1]));
                ctx2d.lineTo(toX(uvBuffer[i2*2]), toY(uvBuffer[i2*2+1]));
                ctx2d.lineTo(toX(uvBuffer[i3*2]), toY(uvBuffer[i3*2+1]));
                ctx2d.lineTo(toX(uvBuffer[i1*2]), toY(uvBuffer[i1*2+1]));
            }
        }
        ctx2d.stroke();

        // Draw Vertices
        for(let i=0; i<uvBuffer.length/2; i++) {
            const isSel = selectedIndices.has(i);
            const isPrimary = i === selectedVertex;
            
            if (isPrimary) {
                ctx2d.fillStyle = '#ffffff';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - 4, toY(uvBuffer[i*2+1]) - 4, 8, 8);
            } else if (isSel) {
                ctx2d.fillStyle = '#fbbf24';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - 3, toY(uvBuffer[i*2+1]) - 3, 6, 6);
            } else {
                ctx2d.fillStyle = '#333';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - 1.5, toY(uvBuffer[i*2+1]) - 1.5, 3, 3);
            }
        }

        // Info Overlay
        if (selectedVertex !== -1) {
            ctx2d.fillStyle = 'white'; ctx2d.font = '10px monospace'; ctx2d.textAlign = 'left';
            const label = `UV: ${uvBuffer[selectedVertex*2].toFixed(3)}, ${uvBuffer[selectedVertex*2+1].toFixed(3)}`;
            ctx2d.fillText(label, toX(uvBuffer[selectedVertex*2]) + 12, toY(uvBuffer[selectedVertex*2+1]) + 4);
        }
    }, [editingAsset, uvBuffer, transform, selectedVertex, selectedIndices, viewportSize]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

        if (e.button === 1 || e.altKey) { setIsDragging(true); return; }

        if (e.button === 0 && uvBuffer) {
            let closest = -1; let minDst = 12;
            for (let i = 0; i < uvBuffer.length / 2; i++) {
                const px = transform.x + uvBuffer[i*2] * transform.k;
                const py = transform.y + (1 - uvBuffer[i*2+1]) * transform.k;
                const dst = Math.sqrt((mx - px)**2 + (my - py)**2);
                if (dst < minDst) { minDst = dst; closest = i; }
            }

            if (closest !== -1) {
                const newSet = new Set(e.shiftKey ? selectedIndices : []);
                if (e.shiftKey && newSet.has(closest)) newSet.delete(closest); 
                else newSet.add(closest);
                
                setSelectedIndices(newSet);
                setSelectedVertex(closest);
                setIsDragging(true);
            } else {
                setSelectedVertex(-1); setSelectedIndices(new Set());
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        if (e.buttons === 4 || e.altKey) {
            setTransform(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
        } else if (selectedIndices.size > 0 && uvBuffer) {
            const du = e.movementX / transform.k; const dv = -e.movementY / transform.k;
            const newBuf = new Float32Array(uvBuffer);
            selectedIndices.forEach(idx => { newBuf[idx*2] += du; newBuf[idx*2+1] += dv; });
            setUvBuffer(newBuf);
        }
    };

    const saveChanges = async () => {
        if (editingAsset && uvBuffer) {
            setIsSaving(true);
            try {
                // Call API instead of direct engine access
                api.commands.mesh.updateAssetGeometry(editingAsset.id, { uvs: uvBuffer });
                await new Promise(r => setTimeout(r, 100)); // Visual feedback
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            <div className="h-8 bg-panel-header border-b border-white/5 flex items-center px-2 justify-between shrink-0">
                <div className="flex items-center gap-4 text-[10px] text-text-secondary uppercase font-bold tracking-widest">
                    <div className="flex items-center gap-1"><Icon name="LayoutGrid" size={12} className="text-accent" /> UV Editor</div>
                    <div className="flex items-center gap-2 bg-black/20 rounded px-2 py-0.5 border border-white/5">
                        {['VERTEX', 'EDGE', 'FACE'].map(m => (
                            <button key={m} onClick={() => setSelectionMode(m as any)} className={`hover:text-white transition-colors ${selectionMode === m ? 'text-accent' : ''}`}>
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
                        <button 
                            onClick={saveChanges} 
                            disabled={isSaving}
                            className={`flex items-center gap-1 bg-accent hover:bg-accent-hover text-white text-[10px] px-3 py-1 rounded-full transition-all shadow-lg ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <Icon name={isSaving ? "Loader2" : "Save"} size={10} className={isSaving ? "animate-spin" : ""} />
                            {isSaving ? "Syncing..." : "Apply Changes"}
                        </button>
                    )}
                </div>
            </div>
            <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-crosshair bg-[#0a0a0a]" 
                onWheel={(e) => {
                    const rect = containerRef.current!.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
                    const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1);
                    const newK = Math.max(10, transform.k * zoomFactor);
                    const wx = (mouseX - transform.x) / transform.k; const wy = (mouseY - transform.y) / transform.k;
                    setTransform({ x: mouseX - wx * newK, y: mouseY - wy * newK, k: newK });
                }} 
                onMouseDown={handleMouseDown} 
                onMouseMove={handleMouseMove} 
                onMouseUp={() => setIsDragging(false)} 
                onMouseLeave={() => setIsDragging(false)}
                onContextMenu={e => e.preventDefault()}
            >
                <canvas ref={canvasRef} className="block" />
                <div className="absolute bottom-2 left-2 flex gap-4 text-[9px] text-text-secondary opacity-50 pointer-events-none bg-black/50 px-2 py-1 rounded border border-white/5">
                    <span>Pan: Alt+Drag / MMB</span>
                    <span>Zoom: Wheel</span>
                    <span>Focus: F</span>
                </div>
            </div>
        </div>
    );
};
