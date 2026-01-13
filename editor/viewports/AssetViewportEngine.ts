
import { IEngine, MeshComponentMode, Vector3, SoftSelectionFalloff, StaticMeshAsset, SkeletalMeshAsset } from '@/types';
import { SoAEntitySystem } from '@/engine/ecs/EntitySystem';
import { SceneGraph } from '@/engine/SceneGraph';
import { SelectionSystem } from '@/engine/systems/SelectionSystem';
import { assetManager } from '@/engine/AssetManager';
import { COMPONENT_MASKS } from '@/engine/constants';
import { MeshRenderSystem } from '@/engine/systems/MeshRenderSystem';
import { DeformationSystem, SoftSelectionMode } from '@/engine/systems/DeformationSystem';
import { eventBus } from '@/engine/EventBus';

type GizmoRendererFacade = {
    renderGizmos: (
        vp: Float32Array,
        pos: { x: number; y: number; z: number },
        scale: number,
        hoverAxis: any,
        activeAxis: any
    ) => void;
};

export class AssetViewportEngine implements IEngine {
    // --- Core engine-like state ---
    ecs = new SoAEntitySystem();
    sceneGraph = new SceneGraph();
    selectionSystem: SelectionSystem;
    deformationSystem: DeformationSystem;
    
    // Core Rendering System
    meshSystem = new MeshRenderSystem();

    // Camera / viewport
    currentViewProj: Float32Array | null = null;
    currentCameraPos: Vector3 = { x: 0, y: 0, z: 0 };
    currentWidth = 1;
    currentHeight = 1;

    // Tooling mode
    meshComponentMode: MeshComponentMode = 'OBJECT';

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

    // Cross-viewport synchronization
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
        this.deformationSystem = new DeformationSystem();
    }

    // --- Soft Selection Properties (Forwarding to DeformationSystem) ---
    get softSelectionEnabled() { return this.deformationSystem.enabled; }
    set softSelectionEnabled(v: boolean) { this.deformationSystem.enabled = v; }
    
    get softSelectionRadius() { return this.deformationSystem.radius; }
    set softSelectionRadius(v: number) { this.deformationSystem.radius = v; }

    get softSelectionMode() { return this.deformationSystem.mode; }
    set softSelectionMode(v: SoftSelectionMode) { this.deformationSystem.mode = v; }

    get softSelectionFalloff() { return this.deformationSystem.falloff; }
    set softSelectionFalloff(v: SoftSelectionFalloff) { this.deformationSystem.falloff = v; }

    get softSelectionHeatmapVisible() { return this.deformationSystem.heatmapVisible; }
    set softSelectionHeatmapVisible(v: boolean) { this.deformationSystem.heatmapVisible = v; }

    recalculateSoftSelection(trigger: boolean = true) {
        this.deformationSystem.recalculateSoftSelection(trigger, this.meshComponentMode);
    }

    startVertexDrag(entityId: string) {
        this.deformationSystem.startVertexDrag(entityId);
    }

    updateVertexDrag(entityId: string, delta: Vector3) {
        this.deformationSystem.updateVertexDrag(entityId, delta);
    }

    endVertexDrag() {
        this.deformationSystem.endVertexDrag();
    }

    clearDeformation() {
        this.deformationSystem.clearDeformation();
    }

    initGL(gl: WebGL2RenderingContext) {
        this.meshSystem.init(gl);
        
        this.deformationSystem.init(
            this.ecs,
            this.sceneGraph,
            this.selectionSystem,
            this.meshSystem
        );

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

    setPreviewMesh(meshAssetId: string): string {
        const meshIntId = assetManager.getMeshID(meshAssetId);

        if (!this.previewEntityId) {
            this.previewEntityId = this.ecs.createEntity('PreviewMesh');
            this.entityId = this.previewEntityId;
            this.sceneGraph.registerEntity(this.previewEntityId);
            const idx = this.ecs.idToIndex.get(this.previewEntityId)!;
            this.ecs.store.componentMask[idx] |= COMPONENT_MASKS.MESH;
            this.ecs.store.meshType[idx] = meshIntId;
            this.ecs.store.materialIndex[idx] = 1; 
        } else {
            const idx = this.ecs.idToIndex.get(this.previewEntityId)!;
            this.ecs.store.componentMask[idx] |= COMPONENT_MASKS.MESH;
            this.ecs.store.meshType[idx] = meshIntId;
        }

        this.entityId = this.previewEntityId;
        this.selectionSystem.setSelected([this.previewEntityId]);
        
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

    syncTransforms(notify = true) {
        this.sceneGraph.update();
        if (notify) this.notifyUI();
    }

    notifyUI() { this.onNotifyUI?.(); }

    pushUndoState() {}

    render(time: number, renderMode: number) {
        if (!this.currentViewProj) return;
        
        this.meshSystem.prepareBuckets(this.ecs.store, this.ecs.count);
        
        const softSelData = {
            enabled: this.deformationSystem.enabled && this.meshComponentMode !== 'OBJECT',
            center: {x:0, y:0, z:0},
            radius: this.deformationSystem.radius,
            heatmapVisible: this.deformationSystem.heatmapVisible
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
