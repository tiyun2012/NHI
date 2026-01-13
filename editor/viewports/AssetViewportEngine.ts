
import { IEngine, MeshComponentMode, Vector3, SoftSelectionFalloff, StaticMeshAsset, SkeletalMeshAsset } from '@/types';
import { MeshTopologyUtils } from '@/engine/MeshTopologyUtils';
import { SoAEntitySystem } from '@/engine/ecs/EntitySystem';
import { SceneGraph } from '@/engine/SceneGraph';
import { SelectionSystem } from '@/engine/systems/SelectionSystem';
import { assetManager } from '@/engine/AssetManager';
import { COMPONENT_MASKS } from '@/engine/constants';
import { MeshRenderSystem } from '@/engine/systems/MeshRenderSystem';
import { eventBus } from '@/engine/EventBus';
import { updateMeshBounds, recomputeVertexNormalsInPlace } from '@/engine/geometry/meshGeometry';

type GizmoRendererFacade = {
    renderGizmos: (
        vp: Float32Array,
        pos: { x: number; y: number; z: number },
        scale: number,
        hoverAxis: any,
        activeAxis: any
    ) => void;
};

/**
 * Minimal engine-like wrapper used by "asset" viewports (StaticMesh, etc)
 * so they can reuse standard editor tools (selection + gizmo) without
 * touching the main scene engine instance.
 */
export class AssetViewportEngine implements IEngine {
    // --- Core engine-like state ---
    ecs = new SoAEntitySystem();
    sceneGraph = new SceneGraph();
    selectionSystem: SelectionSystem;
    
    // Core Rendering System
    meshSystem = new MeshRenderSystem();

    // Camera / viewport (set by the hosting viewport each frame)
    currentViewProj: Float32Array | null = null;
    currentCameraPos: Vector3 = { x: 0, y: 0, z: 0 };
    currentWidth = 1;
    currentHeight = 1;

    // Tooling mode
    meshComponentMode: MeshComponentMode = 'OBJECT';

    // SelectionSystem expects these
    softSelectionEnabled = false;
    softSelectionRadius = 1.0;

    // Soft selection shaping (mirrors main engine)
    softSelectionMode: 'FIXED' | 'DYNAMIC' = 'FIXED';
    softSelectionFalloff: SoftSelectionFalloff = 'VOLUME';
    softSelectionHeatmapVisible = false;
    private softSelectionWeights = new Map<number, Float32Array>();

    softWeightsVersion = 0;

    // GizmoSystem expects renderer facade
    renderer: GizmoRendererFacade = {
        renderGizmos: () => { /* set via setRenderer */ },
    };

    /**
     * Public id for the single preview entity.
     */
    entityId: string | null = null;

    // Local entity holding the preview mesh
    private previewEntityId: string | null = null;

    // Deformation (vertex drag)
    private vertexSnapshot: Float32Array | null = null;
    private activeDeformationEntity: string | null = null;
    private currentDeformationDelta: Vector3 = { x: 0, y: 0, z: 0 };
    private isVertexDragging: boolean = false;

    // Cross-viewport synchronization (asset editor -> main scene)
    private emitAssetEvents: boolean = true;
    private emitDuringDrag: boolean = false;
    private pendingEmit: { id: string; type: 'MESH' | 'SKELETAL_MESH' } | null = null;
    private pendingEmitRaf: number | null = null;

    constructor(
        private onNotifyUI?: () => void,
        private onGeometryUpdated?: (assetId: string) => void,
        private onGeometryFinalized?: (assetId: string) => void,
        opts?: { emitAssetEvents?: boolean; emitDuringDrag?: boolean },
    ) {
        this.emitAssetEvents = opts?.emitAssetEvents ?? true;
        this.emitDuringDrag = opts?.emitDuringDrag ?? false;
        this.sceneGraph.setContext(this.ecs);
        this.selectionSystem = new SelectionSystem(this);
    }

    private requestAssetEmit(id: string, type: 'MESH' | 'SKELETAL_MESH') {
        if (!this.emitAssetEvents) return;
        this.pendingEmit = { id, type };
        if (this.pendingEmitRaf != null) return;
        this.pendingEmitRaf = requestAnimationFrame(() => {
            this.pendingEmitRaf = null;
            if (this.pendingEmit) {
                eventBus.emit('ASSET_UPDATED', { id: this.pendingEmit.id, type: this.pendingEmit.type });
                this.pendingEmit = null;
            }
        });
    }

    initGL(gl: WebGL2RenderingContext) {
        this.meshSystem.init(gl);
        
        // If we have a mesh pending, register it now
        if (this.previewEntityId) {
            const idx = this.ecs.idToIndex.get(this.previewEntityId);
            if (idx !== undefined) {
                const meshIntId = this.ecs.store.meshType[idx];
                const uuid = assetManager.meshIntToUuid.get(meshIntId);
                if (uuid) {
                    const asset = assetManager.getAsset(uuid);
                    if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                        this.meshSystem.registerMesh(meshIntId, asset.geometry);
                    }
                }
            }
        }
    }

    setRenderer(renderer: GizmoRendererFacade) {
        this.renderer = renderer;
    }

    setViewport(vp: Float32Array, cameraPos: Vector3, cssWidth: number, cssHeight: number) {
        this.currentViewProj = vp;
        this.currentCameraPos = cameraPos;
        this.currentWidth = cssWidth;
        this.currentHeight = cssHeight;
    }

    /** Ensure a single preview mesh entity exists and points at the given mesh asset. */
    setPreviewMesh(meshAssetId: string): string {
        const meshIntId = assetManager.getMeshID(meshAssetId);

        if (!this.previewEntityId) {
            this.previewEntityId = this.ecs.createEntity('PreviewMesh');
            this.entityId = this.previewEntityId;
            this.sceneGraph.registerEntity(this.previewEntityId);
            const idx = this.ecs.idToIndex.get(this.previewEntityId)!;
            this.ecs.store.componentMask[idx] |= COMPONENT_MASKS.MESH;
            this.ecs.store.meshType[idx] = meshIntId;
            // Set default material (or standard)
            this.ecs.store.materialIndex[idx] = 1; 
        } else {
            const idx = this.ecs.idToIndex.get(this.previewEntityId)!;
            this.ecs.store.componentMask[idx] |= COMPONENT_MASKS.MESH;
            this.ecs.store.meshType[idx] = meshIntId;
        }

        this.entityId = this.previewEntityId;
        this.selectionSystem.setSelected([this.previewEntityId]);
        
        // Register with system immediately if GL is ready
        if (this.meshSystem.gl) {
            const asset = assetManager.getAsset(meshAssetId);
            if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
                this.meshSystem.registerMesh(meshIntId, asset.geometry);
            }
        }

        return this.previewEntityId;
    }

    getPreviewEntityId(): string | null {
        return this.previewEntityId;
    }

    resetPreviewTransform() {
        if (!this.previewEntityId) return;
        const idx = this.ecs.idToIndex.get(this.previewEntityId);
        if (idx == null) return;
        this.ecs.store.setPosition(idx, 0, 0, 0);
        this.ecs.store.setScale(idx, 1, 1, 1);
        this.ecs.store.setRotation(idx, 0, 0, 0);
        this.sceneGraph.setDirty(this.previewEntityId);
        this.syncTransforms(false);
    }

    loadSceneFromAsset(_sceneAssetId: string) {}

    // --- SelectionSystem hooks ---
    recalculateSoftSelection(trigger: boolean = true) {
        if (this.meshComponentMode === 'OBJECT' || !this.softSelectionEnabled) {
            // Clear buffer in system
            this.softSelectionWeights.forEach((w, meshId) => {
                w.fill(0);
                this.meshSystem.updateSoftSelectionBuffer(meshId, w);
            });
            this.softSelectionWeights.clear();
            this.softWeightsVersion++;
            return;
        }

        const firstIdx = this.selectionSystem.selectedIndices.values().next().value as number | undefined;
        if (firstIdx == null) return;

        const meshType = this.ecs.store.meshType[firstIdx];
        const meshUuid = assetManager.meshIntToUuid.get(meshType);
        if (!meshUuid) return;
        const asset = assetManager.getAsset(meshUuid);
        if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH')) return;
        
        // Narrow type to access geometry
        const meshAsset = asset as StaticMeshAsset;
        if (!meshAsset.geometry?.vertices || !meshAsset.geometry.indices) return;

        const vertices = (this.softSelectionMode === 'FIXED' && this.vertexSnapshot) ? this.vertexSnapshot : meshAsset.geometry.vertices;
        const vertexCount = vertices.length / 3;

        const sx = this.ecs.store.scaleX[firstIdx] || 1.0;
        const sy = this.ecs.store.scaleY[firstIdx] || 1.0;
        const sz = this.ecs.store.scaleZ[firstIdx] || 1.0;
        const scale = Math.max(sx, Math.max(sy, sz)) || 1.0;
        const localRadius = this.softSelectionRadius / Math.max(1e-6, scale);

        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        let weights: Float32Array;

        if (!selectedVerts || selectedVerts.size === 0) {
            weights = new Float32Array(vertexCount);
        } else if (this.softSelectionFalloff === 'SURFACE') {
            weights = MeshTopologyUtils.computeSurfaceWeights(meshAsset.geometry.indices, vertices, selectedVerts, localRadius, vertexCount);
        } else {
            let cx = 0, cy = 0, cz = 0;
            for (const vi of selectedVerts) {
                const o = vi * 3; cx += vertices[o]; cy += vertices[o + 1]; cz += vertices[o + 2];
            }
            const inv = 1.0 / Math.max(1, selectedVerts.size);
            cx *= inv; cy *= inv; cz *= inv;

            weights = new Float32Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) {
                if (selectedVerts.has(i)) { weights[i] = 1.0; continue; }
                const o = i * 3;
                const dist = Math.hypot(vertices[o] - cx, vertices[o + 1] - cy, vertices[o + 2] - cz);
                if (dist <= localRadius) {
                    const t = 1.0 - dist / Math.max(1e-6, localRadius);
                    weights[i] = t * t * (3 - 2 * t);
                } else {
                    weights[i] = 0.0;
                }
            }
        }

        this.softSelectionWeights.set(meshType, weights);
        this.meshSystem.updateSoftSelectionBuffer(meshType, weights); // Push directly to GPU
        this.softWeightsVersion++;

        if (
            trigger &&
            this.isVertexDragging &&
            selectedVerts && selectedVerts.size > 0 &&
            this.vertexSnapshot &&
            this.activeDeformationEntity
        ) {
            this.applyDeformation(this.activeDeformationEntity);
        }
    }

    syncTransforms(notify = true) {
        this.sceneGraph.update();
        if (notify) this.notifyUI();
    }

    notifyUI() { this.onNotifyUI?.(); }

    pushUndoState() {}

    startVertexDrag(entityId: string) {
        if (!entityId) return;
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx == null) return;

        const selectedVerts = this.selectionSystem.getSelectionAsVertices();
        if (!selectedVerts || selectedVerts.size === 0) {
            this.clearDeformation();
            return;
        }

        const meshType = this.ecs.store.meshType[idx];
        const meshUuid = assetManager.meshIntToUuid.get(meshType);
        if (!meshUuid) return;
        const asset = assetManager.getAsset(meshUuid) as StaticMeshAsset;
        if (!asset?.geometry?.vertices) return;

        this.vertexSnapshot = new Float32Array(asset.geometry.vertices);
        this.activeDeformationEntity = entityId;
        this.currentDeformationDelta = { x: 0, y: 0, z: 0 };
        this.isVertexDragging = true;

        this.recalculateSoftSelection(false);
    }

    updateVertexDrag(entityId: string, delta: Vector3) {
        if (!this.vertexSnapshot || this.activeDeformationEntity !== entityId || !this.isVertexDragging) this.startVertexDrag(entityId);
        if (!this.vertexSnapshot || !this.activeDeformationEntity || !this.isVertexDragging) return;

        const deltaInc: Vector3 = {
            x: delta.x - this.currentDeformationDelta.x,
            y: delta.y - this.currentDeformationDelta.y,
            z: delta.z - this.currentDeformationDelta.z,
        };
        this.currentDeformationDelta = { x: delta.x, y: delta.y, z: delta.z };

        if (this.softSelectionMode === 'DYNAMIC') {
            this.applyIncrementalDeformation(this.activeDeformationEntity, deltaInc);
        } else {
            this.applyDeformation(this.activeDeformationEntity);
        }
    }

    private applyDeformation(entityId: string) {
        // ... (Deformation Logic same as Engine.ts - abridged for brevity as it works on CPU data) ...
        // For brevity, assuming existing logic or copy from Engine.ts
        // This part modifies asset.geometry.vertices directly.
        // After modification, we must notify MeshSystem to upload new verts.
        
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx == null) return;
        const meshType = this.ecs.store.meshType[idx];
        const meshUuid = assetManager.meshIntToUuid.get(meshType);
        if (!meshUuid || !this.vertexSnapshot) return;
        const asset = assetManager.getAsset(meshUuid) as StaticMeshAsset | SkeletalMeshAsset | undefined;
        if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH')) return;
        
        const v = asset.geometry.vertices;
        const snap = this.vertexSnapshot;
        const weights = this.softSelectionWeights.get(meshType);
        const sel = this.selectionSystem.getSelectionAsVertices();
        
        if (this.softSelectionEnabled && this.meshComponentMode !== 'OBJECT' && weights) {
             for(let i=0; i<weights.length; i++) {
                 const w = weights[i];
                 if(w > 1e-4) {
                     const o = i*3;
                     v[o] = snap[o] + this.currentDeformationDelta.x * w;
                     v[o+1] = snap[o+1] + this.currentDeformationDelta.y * w;
                     v[o+2] = snap[o+2] + this.currentDeformationDelta.z * w;
                 } else {
                     const o = i*3;
                     v[o] = snap[o]; v[o+1] = snap[o+1]; v[o+2] = snap[o+2];
                 }
             }
        } else {
             v.set(snap);
             for(const i of sel) {
                 const o = i*3;
                 v[o] += this.currentDeformationDelta.x;
                 v[o+1] += this.currentDeformationDelta.y;
                 v[o+2] += this.currentDeformationDelta.z;
             }
        }
        
        updateMeshBounds(asset);
        // Update positions on GPU; normals are recomputed on finalize.
        this.meshSystem.updateMeshGeometry(meshType, asset.geometry, { positions: true, normals: false });
        this.onGeometryUpdated?.(meshUuid);
        if (this.emitDuringDrag) this.queueAssetUpdatedEvent(meshUuid, asset.type);
    }

    private applyIncrementalDeformation(entityId: string, deltaInc: Vector3) {
        // Similar to applyDeformation but incremental
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx == null) return;
        const meshType = this.ecs.store.meshType[idx];
        const meshUuid = assetManager.meshIntToUuid.get(meshType);
        if (!meshUuid) return;
        const asset = assetManager.getAsset(meshUuid) as StaticMeshAsset | SkeletalMeshAsset | undefined;
        if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH')) return;
        
        const v = asset.geometry.vertices;
        const weights = this.softSelectionWeights.get(meshType);
        const sel = this.selectionSystem.getSelectionAsVertices();
        
        if (this.softSelectionEnabled && this.meshComponentMode !== 'OBJECT' && weights) {
             for(let i=0; i<weights.length; i++) {
                 const w = weights[i];
                 if(w > 1e-4) {
                     const o = i*3;
                     v[o] += deltaInc.x * w;
                     v[o+1] += deltaInc.y * w;
                     v[o+2] += deltaInc.z * w;
                 }
             }
        } else {
             for(const i of sel) {
                 const o = i*3;
                 v[o] += deltaInc.x;
                 v[o+1] += deltaInc.y;
                 v[o+2] += deltaInc.z;
             }
        }
        
        updateMeshBounds(asset);
        this.meshSystem.updateMeshGeometry(meshType, asset.geometry, { positions: true, normals: false });
        this.onGeometryUpdated?.(meshUuid);
        if (this.emitDuringDrag) this.queueAssetUpdatedEvent(meshUuid, asset.type);
    }

    private queueAssetUpdatedEvent(assetId: string, type: 'MESH' | 'SKELETAL_MESH') {
        if (!this.emitAssetEvents) return;
        this.pendingEmit = { id: assetId, type };

        // If we want real-time sync, throttle to 1 emit per frame.
        if (this.pendingEmitRaf != null) return;
        if (typeof requestAnimationFrame !== 'function') {
            eventBus.emit('ASSET_UPDATED', { id: assetId, type });
            this.pendingEmit = null;
            return;
        }
        this.pendingEmitRaf = requestAnimationFrame(() => {
            this.pendingEmitRaf = null;
            const p = this.pendingEmit;
            this.pendingEmit = null;
            if (p) eventBus.emit('ASSET_UPDATED', { id: p.id, type: p.type });
        });
    }

    endVertexDrag() {
        if (!this.isVertexDragging || !this.activeDeformationEntity) return;

        // If there was no effective movement, don't finalize (avoids no-op commits).
        const d = this.currentDeformationDelta;
        const deltaSq = d.x * d.x + d.y * d.y + d.z * d.z;
        if (deltaSq < 1e-12) {
            this.clearDeformation();
            return;
        }

        const idx = this.ecs.idToIndex.get(this.activeDeformationEntity);
        if (idx == null) {
            this.clearDeformation();
            return;
        }

        const meshType = this.ecs.store.meshType[idx];
        const meshUuid = assetManager.meshIntToUuid.get(meshType);
        if (!meshUuid) {
            this.clearDeformation();
            return;
        }

        const asset = assetManager.getAsset(meshUuid) as StaticMeshAsset | SkeletalMeshAsset | undefined;
        if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
            // Finalize normals once after sculpt/vertex drag ends.
            const g = asset.geometry;
            if (g?.vertices && g?.indices) {
                (asset as any).geometry.normals = recomputeVertexNormalsInPlace(g.vertices, g.indices, g.normals);
                this.meshSystem.updateMeshGeometry(meshType, asset.geometry, { normals: true, positions: false });
            }

            // Ensure other viewports (main scene) reupload their GPU buffers.
            if (this.emitAssetEvents) {
                eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
            }
        }

        this.onGeometryFinalized?.(meshUuid);
        // DO NOT clear deformation here. We want to persist the drag state so subsequent radius adjustments
        // can re-apply the deformation with new weights relative to the start state.
        // Clearing happens explicitly when selecting a new entity/component or clicking empty space.
    }

    clearDeformation() {
        this.vertexSnapshot = null;
        this.activeDeformationEntity = null;
        this.currentDeformationDelta = { x: 0, y: 0, z: 0 };
        this.isVertexDragging = false;
        this.recalculateSoftSelection(false);
    }

    render(time: number, renderMode: number) {
        if (!this.currentViewProj) return;
        
        this.meshSystem.prepareBuckets(this.ecs.store, this.ecs.count);
        
        const softSelData = {
            enabled: this.softSelectionEnabled && this.meshComponentMode !== 'OBJECT',
            center: {x:0, y:0, z:0},
            radius: this.softSelectionRadius,
            heatmapVisible: this.softSelectionHeatmapVisible
        };

        const lightDir = [0.5, -1.0, 0.5];
        const lightColor = [1, 1, 1];
        const lightIntensity = 1.0;

        this.meshSystem.render(
            this.ecs.store, 
            this.selectionSystem.selectedIndices,
            this.currentViewProj,
            { x: this.currentCameraPos.x, y: this.currentCameraPos.y, z: this.currentCameraPos.z },
            time,
            lightDir, lightColor, lightIntensity,
            renderMode,
            'OPAQUE',
            softSelData
        );
    }
}
