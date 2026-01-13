
import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { SelectionSystem } from './SelectionSystem';
import { MeshRenderSystem } from './MeshRenderSystem';
import { assetManager } from '../AssetManager';
import { StaticMeshAsset, SkeletalMeshAsset, Vector3, SoftSelectionFalloff, MeshComponentMode } from '@/types';
import { MeshTopologyUtils } from '../MeshTopologyUtils';
import { Vec3Utils, MathUtils } from '../math';
import { updateMeshBounds, recomputeVertexNormalsInPlace } from '../geometry/meshGeometry';
import { eventBus } from '../EventBus';

export type SoftSelectionMode = 'FIXED' | 'DYNAMIC';

export class DeformationSystem {
    // Configuration
    enabled: boolean = false;
    radius: number = 2.0;
    mode: SoftSelectionMode = 'FIXED';
    falloff: SoftSelectionFalloff = 'VOLUME';
    heatmapVisible: boolean = true;

    // State
    private weights: Map<number, Float32Array> = new Map(); // MeshID -> Weights
    private vertexSnapshot: Float32Array | null = null;
    private currentDeformationDelta: Vector3 = { x: 0, y: 0, z: 0 };
    private activeDeformationEntity: string | null = null;
    isVertexDragging: boolean = false;

    // Dependencies (injected via init or update)
    private ecs!: { store: ComponentStorage, idToIndex: Map<string, number> };
    private sceneGraph!: SceneGraph;
    private selectionSystem!: SelectionSystem;
    private meshSystem!: MeshRenderSystem;

    init(
        ecs: { store: ComponentStorage, idToIndex: Map<string, number> },
        sceneGraph: SceneGraph,
        selectionSystem: SelectionSystem,
        meshSystem: MeshRenderSystem
    ) {
        this.ecs = ecs;
        this.sceneGraph = sceneGraph;
        this.selectionSystem = selectionSystem;
        this.meshSystem = meshSystem;
    }

    recalculateSoftSelection(trigger: boolean = true, meshComponentMode: MeshComponentMode = 'VERTEX') {
        if (!this.enabled || meshComponentMode === 'OBJECT') {
            this.weights.forEach((w, meshId) => {
                w.fill(0);
                this.meshSystem.updateSoftSelectionBuffer(meshId, w);
            });
            this.weights.clear();
            return;
        }

        if (this.selectionSystem.selectedIndices.size === 0) return;
        const idx = Array.from(this.selectionSystem.selectedIndices)[0];
        const meshType = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshType);
        if (!uuid) return;
        const asset = assetManager.getAsset(uuid) as StaticMeshAsset;
        if (!asset) return;

        const vertices = this.mode === 'FIXED' && this.vertexSnapshot ? this.vertexSnapshot : asset.geometry.vertices;
        const vertexCount = vertices.length / 3;
        
        const sx = this.ecs.store.scaleX[idx];
        const sy = this.ecs.store.scaleY[idx];
        const sz = this.ecs.store.scaleZ[idx];
        const scale = Math.max(sx, Math.max(sy, sz)) || 1.0;
        
        const localRadius = this.radius / scale;
        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        
        let weights: Float32Array;

        if (this.falloff === 'SURFACE') {
            weights = MeshTopologyUtils.computeSurfaceWeights(asset.geometry.indices, vertices, selectedVerts, localRadius, vertexCount);
        } else {
            weights = this.weights.get(meshType) || new Float32Array(vertexCount);
            if (weights.length !== vertexCount) weights = new Float32Array(vertexCount);
            
            const centroid = { x: 0, y: 0, z: 0 };
            const selArray = Array.from(selectedVerts);
            if (selArray.length > 0) {
                for(const s of selArray) {
                    centroid.x += vertices[s*3];
                    centroid.y += vertices[s*3+1];
                    centroid.z += vertices[s*3+2];
                }
                const invLen = 1.0 / selArray.length;
                centroid.x *= invLen; centroid.y *= invLen; centroid.z *= invLen;
                
                for(let i=0; i<vertexCount; i++) {
                    if (selectedVerts.has(i)) {
                        weights[i] = 1.0;
                        continue;
                    }
                    const px = vertices[i*3], py = vertices[i*3+1], pz = vertices[i*3+2];
                    const dist = Math.sqrt((px-centroid.x)**2 + (py-centroid.y)**2 + (pz-centroid.z)**2);
                    
                    if (dist <= localRadius) {
                        const t = 1.0 - (dist / localRadius);
                        weights[i] = t*t*(3 - 2*t);
                    } else {
                        weights[i] = 0.0;
                    }
                }
            } else {
                weights.fill(0);
            }
        }

        this.weights.set(meshType, weights);
        this.meshSystem.updateSoftSelectionBuffer(meshType, weights);
        
        if (
            trigger &&
            this.isVertexDragging &&
            selectedVerts.size > 0 &&
            this.vertexSnapshot &&
            this.activeDeformationEntity
        ) {
            this.applyDeformation(this.activeDeformationEntity);
        }
    }

    startVertexDrag(entityId: string) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;

        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        if (!selectedVerts || selectedVerts.size === 0) {
            this.clearDeformation();
            return;
        }

        const meshType = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshType);
        if (!uuid) return;
        const asset = assetManager.getAsset(uuid) as StaticMeshAsset;

        if (!asset) return;

        this.vertexSnapshot = new Float32Array(asset.geometry.vertices);
        this.activeDeformationEntity = entityId;
        this.currentDeformationDelta = { x: 0, y: 0, z: 0 };
        this.isVertexDragging = true;

        this.recalculateSoftSelection(false);
    }

    updateVertexDrag(entityId: string, deltaLocal: Vector3) {
        if (!this.vertexSnapshot || this.activeDeformationEntity !== entityId || !this.isVertexDragging) {
            this.startVertexDrag(entityId);
        }

        if (!this.vertexSnapshot || !this.activeDeformationEntity || !this.isVertexDragging) return;

        if (this.enabled && this.mode === 'DYNAMIC') {
            const incrementalDelta = Vec3Utils.subtract(deltaLocal, this.currentDeformationDelta, {x:0,y:0,z:0});
            this.applyIncrementalDeformation(entityId, incrementalDelta);
            this.currentDeformationDelta = deltaLocal;
        } else {
            this.currentDeformationDelta = deltaLocal;
            this.applyDeformation(entityId);
        }
    }

    endVertexDrag() {
        if (!this.isVertexDragging || !this.activeDeformationEntity) return;

        const d = this.currentDeformationDelta;
        const deltaSq = d.x * d.x + d.y * d.y + d.z * d.z;
        if (deltaSq < 1e-12) {
            this.clearDeformation();
            return;
        }

        const idx = this.ecs.idToIndex.get(this.activeDeformationEntity);
        if (idx !== undefined) {
            const meshIntId = this.ecs.store.meshType[idx];
            const uuid = assetManager.meshIntToUuid.get(meshIntId);
            if (uuid) {
                const asset = assetManager.getAsset(uuid);
                if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                    const g = (asset as StaticMeshAsset | SkeletalMeshAsset).geometry;
                    if (g?.vertices && g?.indices) {
                        (asset as any).geometry.normals = recomputeVertexNormalsInPlace(g.vertices, g.indices, g.normals);
                        this.meshSystem.updateMeshGeometry(meshIntId, asset.geometry, { normals: true, positions: false });
                        eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
                    }
                }
            }
        }

        this.clearDeformation();
    }

    clearDeformation() {
        this.vertexSnapshot = null;
        this.activeDeformationEntity = null;
        this.currentDeformationDelta = { x: 0, y: 0, z: 0 };
        this.isVertexDragging = false;
        // Don't clear weights here to allow visual persistence
    }

    private applyDeformation(entityId: string) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshType = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshType);
        const asset = assetManager.getAsset(uuid!) as StaticMeshAsset;
        if (!asset || !this.vertexSnapshot) return;

        const verts = asset.geometry.vertices;
        const snapshot = this.vertexSnapshot;
        const weights = this.weights.get(meshType);
        const delta = this.currentDeformationDelta;
        const selected = this.selectionSystem.getSelectionAsVertices();

        if (this.enabled && weights) {
            for(let i=0; i<weights.length; i++) {
                const w = weights[i];
                if (w > 0.001) {
                    verts[i*3] = snapshot[i*3] + delta.x * w;
                    verts[i*3+1] = snapshot[i*3+1] + delta.y * w;
                    verts[i*3+2] = snapshot[i*3+2] + delta.z * w;
                } else {
                     verts[i*3] = snapshot[i*3];
                     verts[i*3+1] = snapshot[i*3+1];
                     verts[i*3+2] = snapshot[i*3+2];
                }
            }
        } else {
            verts.set(snapshot);
            for(const i of selected) {
                verts[i*3] += delta.x;
                verts[i*3+1] += delta.y;
                verts[i*3+2] += delta.z;
            }
        }
        
        updateMeshBounds(asset);
        this.meshSystem.updateMeshGeometry(meshType, asset.geometry, { positions: true, normals: false });
    }

    private applyIncrementalDeformation(entityId: string, delta: Vector3) {
         const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshType = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshType);
        const asset = assetManager.getAsset(uuid!) as StaticMeshAsset;
        if (!asset) return;

        const verts = asset.geometry.vertices;
        const weights = this.weights.get(meshType);
        const selected = this.selectionSystem.getSelectionAsVertices();
        
        if (this.enabled && weights) {
            for(let i=0; i<weights.length; i++) {
                const w = weights[i];
                if (w > 1e-4) {
                    verts[i*3] += delta.x * w;
                    verts[i*3+1] += delta.y * w;
                    verts[i*3+2] += delta.z * w;
                }
            }
        } else {
             for(const i of selected) {
                verts[i*3] += delta.x;
                verts[i*3+1] += delta.y;
                verts[i*3+2] += delta.z;
             }
        }
        updateMeshBounds(asset);
        this.meshSystem.updateMeshGeometry(meshType, asset.geometry, { positions: true, normals: false });
    }
}
