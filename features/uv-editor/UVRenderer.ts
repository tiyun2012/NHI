
import { StaticMeshAsset, MeshComponentMode } from '@/types';
import { resizeCanvasToViewport, ViewportSize } from '@/editor/hooks/useViewportSize';

export class UVRenderer {
    static render(
        canvas: HTMLCanvasElement,
        viewportSize: ViewportSize,
        transform: { x: number, y: number, k: number },
        asset: StaticMeshAsset | null,
        uvBuffer: Float32Array | null,
        selection: {
            indices: Set<number>,
            edges: Set<string>,
            faces: Set<number>
        },
        selectionMode: MeshComponentMode,
        selectedVertex: number,
        uiConfig: any
    ) {
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d || !uvBuffer) return;

        // Resize if necessary
        resizeCanvasToViewport(canvas, viewportSize);

        ctx2d.setTransform(viewportSize.dpr, 0, 0, viewportSize.dpr, 0, 0);
        ctx2d.fillStyle = '#0a0a0a';
        ctx2d.fillRect(0, 0, viewportSize.cssWidth, viewportSize.cssHeight);

        const { x, y, k } = transform;
        const toX = (u: number) => x + u * k;
        const toY = (v: number) => y + (1 - v) * k;

        // Helper: Convert hex to rgba for fills
        const hex = uiConfig.selectionEdgeColor || '#4f80f8';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const faceSelectionFill = `rgba(${r}, ${g}, ${b}, 0.4)`; // Increased opacity for visibility
        const faceEdgeHighlight = `rgba(${r}, ${g}, ${b}, 1.0)`;

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
        if (asset?.topology) {
            // First Pass: Unselected Edges
            ctx2d.beginPath();
            ctx2d.strokeStyle = '#4f80f8'; // Default edge color (dim blue)
            ctx2d.lineWidth = 0.5;
            
            asset.topology.faces.forEach((face: number[]) => {
                if (face.length < 3) return;
                
                // Optimization: Draw all unselected mesh edges in one batch if possible, 
                // but we need to skip lines that are part of selected faces to avoid z-fighting/overdraw
                const isFaceSelected = false; // We draw fill later
                
                if (!isFaceSelected) {
                    ctx2d.moveTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                    for(let i=1; i<face.length; i++) ctx2d.lineTo(toX(uvBuffer[face[i]*2]), toY(uvBuffer[face[i]*2+1]));
                    ctx2d.lineTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                }
            });
            ctx2d.stroke();

            // Second Pass: Selected Faces (Fill & Outline)
            if (selection.faces.size > 0) {
                ctx2d.fillStyle = faceSelectionFill;
                ctx2d.strokeStyle = faceEdgeHighlight;
                ctx2d.lineWidth = 2.0;

                asset.topology.faces.forEach((face: number[], fIdx: number) => {
                    if (selection.faces.has(fIdx) && face.length >= 3) {
                        ctx2d.beginPath();
                        ctx2d.moveTo(toX(uvBuffer[face[0]*2]), toY(uvBuffer[face[0]*2+1]));
                        for(let i=1; i<face.length; i++) ctx2d.lineTo(toX(uvBuffer[face[i]*2]), toY(uvBuffer[face[i]*2+1]));
                        ctx2d.closePath();
                        ctx2d.fill();
                        ctx2d.stroke();
                    }
                });
            }

            // Third Pass: Selected Edges (Edge Mode)
            if (selection.edges.size > 0) {
                ctx2d.beginPath();
                ctx2d.strokeStyle = '#fbbf24'; // Selected Edge (Orange/Gold)
                ctx2d.lineWidth = 2.0;
                
                asset.topology.faces.forEach((face: number[]) => {
                    for(let i=0; i<face.length; i++) {
                        const v1 = face[i];
                        const v2 = face[(i+1)%face.length];
                        const edgeKey = [v1, v2].sort((a,b)=>a-b).join('-');
                        
                        if (selection.edges.has(edgeKey)) {
                            ctx2d.moveTo(toX(uvBuffer[v1*2]), toY(uvBuffer[v1*2+1]));
                            ctx2d.lineTo(toX(uvBuffer[v2*2]), toY(uvBuffer[v2*2+1]));
                        }
                    }
                });
                ctx2d.stroke();
            }
        }

        // 3. Vertices
        // Only render vertices if we are in a component mode OR overlay is explicitly on.
        // Default (Object Mode) will skip this loop.
        if (selectionMode === 'VERTEX' || selectionMode === 'UV' || uiConfig.showVertexOverlay) {
            const vSize = Math.max(3, (uiConfig.vertexSize || 1.0) * 3);
            const selSize = vSize * 1.5;
            const primSize = vSize * 2.0;

            for(let i=0; i<uvBuffer.length/2; i++) {
                const isSel = selection.indices.has(i);
                const isPrimary = i === selectedVertex;
                
                if (isPrimary) {
                    ctx2d.fillStyle = '#ffffff';
                    ctx2d.fillRect(toX(uvBuffer[i*2]) - primSize/2, toY(uvBuffer[i*2+1]) - primSize/2, primSize, primSize);
                } else if (isSel) {
                    ctx2d.fillStyle = uiConfig.selectionEdgeColor || '#4f80f8';
                    ctx2d.fillRect(toX(uvBuffer[i*2]) - selSize/2, toY(uvBuffer[i*2+1]) - selSize/2, selSize, selSize);
                } else {
                    // Mode-dependent coloring
                    if (selectionMode === 'UV') {
                        ctx2d.fillStyle = '#55f785'; // UV Green
                    } else {
                        // VERTEX mode or Overlay (Object Mode with overlay) -> Purple
                        ctx2d.fillStyle = uiConfig.vertexColor || '#a855f7'; 
                    }
                    ctx2d.fillRect(toX(uvBuffer[i*2]) - vSize/2, toY(uvBuffer[i*2+1]) - vSize/2, vSize, vSize);
                }
            }
        }
    }
}
