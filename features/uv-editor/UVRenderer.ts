
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
            asset.topology.faces.forEach((face: number[], fIdx: number) => {
                if (face.length < 3) return;

                // Highlight Selected Faces
                if (selection.faces.has(fIdx)) {
                    ctx2d.fillStyle = 'rgba(79, 128, 248, 0.25)'; 
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
                    
                    const isEdgeSelected = selection.edges.has(edgeKey);
                    if (isEdgeSelected) {
                        ctx2d.save();
                        ctx2d.strokeStyle = '#fbbf24'; 
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
            } else if (selectionMode === 'VERTEX' || selectionMode === 'UV' || uiConfig.showVertexOverlay) {
                ctx2d.fillStyle = uiConfig.vertexColor || '#a855f7';
                ctx2d.fillRect(toX(uvBuffer[i*2]) - vSize/2, toY(uvBuffer[i*2+1]) - vSize/2, vSize, vSize);
            }
        }
    }
}
