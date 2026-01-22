
import { IEngine, MeshComponentMode, Vector3, SoftSelectionFalloff, StaticMeshAsset, SkeletalMeshAsset, ComponentType, UIConfiguration } from '@/types';
import { SoAEntitySystem } from '@/engine/ecs/EntitySystem';
import { SceneGraph } from '@/engine/SceneGraph';
import { SelectionSystem } from '@/engine/systems/SelectionSystem';
import { assetManager } from '@/engine/AssetManager';
import { COMPONENT_MASKS } from '@/engine/constants';
import { MeshRenderSystem } from '@/engine/systems/MeshRenderSystem';
import { DeformationSystem, SoftSelectionMode } from '@/engine/systems/DeformationSystem';
import { consoleService } from '@/engine/Console';
import { TypedEventBus } from '@/engine/core/eventBus';
import { EngineEvents } from '@/engine/api/types';
import { updateMeshBounds } from '@/engine/geometry/meshGeometry';
import { DebugRenderer } from '@/engine/renderers/DebugRenderer';
import { SkeletonTool } from '@/engine/tools/SkeletonTool';
import { DEFAULT_UI_CONFIG } from '@/engine/config/defaults';
import { Vec3Utils } from '@/engine/math';

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
    events = new TypedEventBus<EngineEvents>(); 
    
    // Core Rendering System
    meshSystem = new MeshRenderSystem();
    debugRenderer = new DebugRenderer();
    skeletonTool: SkeletonTool;

    // Configuration (synced from editor context)
    uiConfig: UIConfiguration = DEFAULT_UI_CONFIG;

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
    
    // Skeleton Mapping for Visualization
    skeletonMap: Map<string, string[]> = new Map();
    skeletonEntityAssetMap: Map<string, string> = new Map();

    constructor(
        private onNotifyUI?: () => void,
        private onGeometryUpdated?: (assetId: string) => void,
        private onGeometryFinalized?: (assetId: string) => void
    ) {
        this.sceneGraph.setContext(this.ecs);
        this.selectionSystem = new SelectionSystem(this);
        this.deformationSystem = new DeformationSystem();

        this.skeletonTool = new SkeletonTool({
            getDebugRenderer: () => this.debugRenderer,
            getWorldMatrix: (id) => this.sceneGraph.getWorldMatrix(id),
            getSkeletonEntityAssetMap: () => this.skeletonEntityAssetMap,
            getSkeletonMap: () => this.skeletonMap,
            getEntityIndex: (id) => this.ecs.idToIndex.get(id),
            isEntityActive: (idx) => !!this.ecs.store.isActive[idx],
            getMeshIntId: (idx) => this.ecs.store.meshType[idx],
            getAssetById: (id) => assetManager.getAsset(id) as any,
            meshIntToUuid: (id) => assetManager.meshIntToUuid.get(id),
        });
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

    recalculateSoftSelection(trigger: boolean = true, mode?: MeshComponentMode) {
        this.deformationSystem.recalculateSoftSelection(trigger, mode || this.meshComponentMode);
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

    // --- Selection Interface (IEngine) ---
    setSelected(ids: string[]) {
        this.selectionSystem.setSelected(ids);
        this.updateSkeletonToolActive(ids);
    }

    private updateSkeletonToolActive(ids: string[]) {
        // Simple logic for local preview: if we selected the preview mesh, active the skeleton tool for it
        if (ids.length === 1 && ids[0] === this.previewEntityId) {
             const idx = this.ecs.idToIndex.get(this.previewEntityId!);
             if (idx !== undefined) {
                 const meshIntId = this.ecs.store.meshType[idx];
                 const uuid = assetManager.meshIntToUuid.get(meshIntId);
                 if (uuid) {
                     const asset = assetManager.getAsset(uuid);
                     if (asset && asset.type === 'SKELETAL_MESH') {
                         const skelAsset = asset as SkeletalMeshAsset;
                         this.skeletonTool.setActive(skelAsset.skeletonAssetId || uuid, this.previewEntityId);
                         return;
                     }
                 }
             }
        }
        // Fallback or clear
        this.skeletonTool.setActive(null, null);
    }

    initGL(gl: WebGL2RenderingContext) {
        this.meshSystem.init(gl);
        this.debugRenderer.init(gl);
        
        this.deformationSystem.init(
            this.ecs,
            this.sceneGraph,
            this.selectionSystem,
            this.meshSystem,
            () => this.notifyUI()
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

        // 1. Cleanup old skeleton if exists
        if (this.previewEntityId) {
             const oldBones = this.skeletonMap.get(this.previewEntityId);
             if (oldBones) {
                 oldBones.forEach(bId => this.ecs.deleteEntity(bId, this.sceneGraph));
             }
             this.skeletonMap.delete(this.previewEntityId);
        }

        // 2. Create or Reuse Main Entity
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

        // 3. Handle Skeletal Mesh (Spawn Bones)
        const asset = assetManager.getAsset(meshAssetId);
        if (asset && asset.type === 'SKELETAL_MESH') {
             const skelAsset = asset as SkeletalMeshAsset;
             const bones = skelAsset.skeleton.bones;
             const boneEntityIds: string[] = new Array(bones.length);
             
             bones.forEach((bone, bIdx) => {
                 const boneId = this.ecs.createEntity(bone.name);
                 boneEntityIds[bIdx] = boneId;
                 this.sceneGraph.registerEntity(boneId);
                 
                 const bEcsIdx = this.ecs.idToIndex.get(boneId)!;
                 this.ecs.addComponent(boneId, ComponentType.VIRTUAL_PIVOT);
                 this.ecs.store.vpLength[bEcsIdx] = 0.2; 

                 if (bone.parentIndex !== -1) {
                     const pId = boneEntityIds[bone.parentIndex];
                     if (pId) this.sceneGraph.attach(boneId, pId);
                 } else {
                     this.sceneGraph.attach(boneId, this.previewEntityId!);
                 }
             });
             this.skeletonMap.set(this.previewEntityId, boneEntityIds);
             
             // Activate the skeleton tool for this asset
             if (skelAsset.skeletonAssetId) {
                 this.skeletonTool.setActive(skelAsset.skeletonAssetId, this.previewEntityId);
             } else {
                 // Or treat the mesh asset as the source of truth if it has embedded skeleton
                 this.skeletonTool.setActive(meshAssetId, this.previewEntityId);
             }
        }

        this.entityId = this.previewEntityId;
        this.selectionSystem.setSelected([this.previewEntityId]);
        
        if (this.meshSystem.gl && asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
            this.meshSystem.registerMesh(meshIntId, (asset as StaticMeshAsset).geometry);
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

    notifyUI() { 
        this.onNotifyUI?.();
        this.events.emit('selection:subChanged', undefined);
        this.events.emit('selection:changed', { ids: Array.from(this.selectionSystem.selectedIndices).map(idx => this.ecs.store.ids[idx]) });
    }

    pushUndoState() {}

    selectLoop(mode: MeshComponentMode) {
        this.selectionSystem.selectLoop(mode);
        this.notifyUI();
        // Force a frame update (tick) to ensure the newly selected loop is drawn immediately
        this.render(performance.now() * 0.001, 0);
    }

    extrudeFaces() { consoleService.warn("Local Extrude: Not implemented"); }
    bevelEdges() { consoleService.warn("Local Bevel: Not implemented"); }
    weldVertices() { consoleService.warn("Local Weld: Not implemented"); }
    connectComponents() { consoleService.warn("Local Connect: Not implemented"); }
    deleteSelectedFaces() { consoleService.warn("Local Delete Face: Not implemented"); }

    notifyMeshGeometryChanged(entityId: string) {
        const idx = this.ecs.idToIndex.get(entityId);
        if (idx === undefined) return;
        const meshIntId = this.ecs.store.meshType[idx];
        const uuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!uuid) return;
        const asset = assetManager.getAsset(uuid);
        
        if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
            const meshAsset = asset as StaticMeshAsset | SkeletalMeshAsset;
            if (!meshAsset.geometry) return;
            updateMeshBounds(meshAsset);
            this.meshSystem.updateMeshGeometry(meshIntId, meshAsset.geometry, {
                positions: true,
                normals: true,
                uvs: true,
                vertexColors: true,
                indices: true,
            });
        }
    }

    // Required by CoreModule
    registerAssetWithGPU(asset: any) {
        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            const id = assetManager.getMeshID(asset.id);
            if (id > 0) {
                this.meshSystem.registerMesh(id, asset.geometry);
            }
        }
    }

    // Required by CoreModule to trigger updates
    tick(dt: number) {
        this.sceneGraph.update();
    }

    // Helper to render mesh overlays (selection, vertices) matching MeshModule logic
    private renderMeshOverlays() {
        const selectedIndices = this.selectionSystem.selectedIndices;
        if (selectedIndices.size === 0) return;

        const isObjectMode = this.meshComponentMode === 'OBJECT';
        const isVertexMode = this.meshComponentMode === 'VERTEX';
        const isUVMode = this.meshComponentMode === 'UV';
        const isVertexLikeMode = isVertexMode || isUVMode;
        const isFaceMode = this.meshComponentMode === 'FACE';

        // Only draw overlays if enabled
        if (isObjectMode && !this.uiConfig.selectionEdgeHighlight) return;

        const hexToRgb = (hex: string) => {
            const r = parseInt(hex.substring(1, 3), 16) / 255;
            const g = parseInt(hex.substring(3, 5), 16) / 255;
            const b = parseInt(hex.substring(5, 7), 16) / 255;
            return { r, g, b };
        };

        const colSel = { r: 1.0, g: 1.0, b: 0.0 };
        const colObjectSelection = hexToRgb(this.uiConfig.selectionEdgeColor || '#4f80f8');
        const vertexConfigColor = hexToRgb(this.uiConfig.vertexColor || '#a855f7');
        const wireframeDim = { r: 0.3, g: 0.3, b: 0.35 };

        selectedIndices.forEach((idx: number) => {
            const entityId = this.ecs.store.ids[idx];
            const meshIntId = this.ecs.store.meshType[idx];
            const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
            if (!assetUuid) return;
            const asset = assetManager.getAsset(assetUuid) as any;
            if (!asset || !asset.topology) return;

            const worldMat = this.sceneGraph.getWorldMatrix(entityId);
            if (!worldMat) return;
            const verts = asset.geometry.vertices;
            const colors = asset.geometry.colors;
            const topo = asset.topology;

            // Pre-calculate transformed vertices for performance
            const worldVerts = new Float32Array(verts.length);
            for(let i=0; i<verts.length/3; i++) {
                const x = verts[i*3], y = verts[i*3+1], z = verts[i*3+2];
                const wx = worldMat[0]*x + worldMat[4]*y + worldMat[8]*z + worldMat[12];
                const wy = worldMat[1]*x + worldMat[5]*y + worldMat[9]*z + worldMat[13];
                const wz = worldMat[2]*x + worldMat[6]*y + worldMat[10]*z + worldMat[14];
                worldVerts[i*3] = wx; worldVerts[i*3+1] = wy; worldVerts[i*3+2] = wz;
            }

            const getP = (idx: number) => ({ x: worldVerts[idx*3], y: worldVerts[idx*3+1], z: worldVerts[idx*3+2] });

            // Draw Face Selection (Filled Triangles)
            if (isFaceMode) {
                const faceColor = { ...colObjectSelection, a: 0.25 }; // Semi-transparent
                topo.faces.forEach((face: number[], fIdx: number) => {
                    if (this.selectionSystem.subSelection.faceIds.has(fIdx)) {
                        // Triangulate fan
                        const v0 = face[0];
                        const p0 = getP(v0);
                        for(let k=1; k<face.length-1; k++) {
                            const v1 = face[k];
                            const v2 = face[k+1];
                            this.debugRenderer.drawTriangle(p0, getP(v1), getP(v2), faceColor);
                        }
                    }
                });
            }

            // Draw Edge Highlights / Wireframe
            if (this.debugRenderer.lineCount < this.debugRenderer.maxLines) {
                topo.faces.forEach((face: number[]) => {
                    for(let k=0; k<face.length; k++) {
                        const vA = face[k], vB = face[(k+1)%face.length];
                        const pA = getP(vA);
                        const pB = getP(vB);
                        
                        let color = isObjectMode ? colObjectSelection : (isVertexLikeMode ? wireframeDim : wireframeDim);
                        
                        if (!isObjectMode && !isVertexMode) {
                            // Edge selection check
                            const edgeKey = [vA, vB].sort((a,b)=>a-b).join('-');
                            if (this.selectionSystem.subSelection.edgeIds.has(edgeKey)) color = colSel; 
                        }
                        this.debugRenderer.drawLine(pA, pB, color);
                    }
                });
            }

            // Draw Vertex Overlay
            if (isVertexLikeMode || this.uiConfig.showVertexOverlay) {
                const baseSize = Math.max(3.0, this.uiConfig.vertexSize * 3.0);

                // UV mode selects vertices into subSelection.uvIds, while Vertex mode uses subSelection.vertexIds
                const selectedVertexSet = isUVMode ? this.selectionSystem.subSelection.uvIds : this.selectionSystem.subSelection.vertexIds;

                for(let i=0; i<verts.length/3; i++) {
                    const wx = worldVerts[i*3], wy = worldVerts[i*3+1], wz = worldVerts[i*3+2];

                    const isSelected = selectedVertexSet.has(i);
                    const isHovered = this.selectionSystem.hoveredVertex?.entityId === entityId && this.selectionSystem.hoveredVertex?.index === i;
                    
                    let size = baseSize;
                    let border = 0.0;
                    let r = vertexConfigColor.r, g = vertexConfigColor.g, b = vertexConfigColor.b; 
                    
                    if (colors) {
                        const cr = colors[i*3], cg = colors[i*3+1], cb = colors[i*3+2];
                        if (!(cr > 0.9 && cg > 0.9 && cb > 0.9)) { r *= cr; g *= cg; b *= cb; }
                    }

                    if (isSelected || isHovered) {
                        r = colSel.r; g = colSel.g; b = colSel.b;
                        size = baseSize * 1.5; 
                        border = 0.0; 
                    }

                    this.debugRenderer.drawPointRaw(wx, wy, wz, r, g, b, 1.0, size, border);
                }
            }
        });
    }

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
        
        // Render Overlays (Debug Renderer)
        this.debugRenderer.begin();
        
        // 1. Skeleton Tool
        this.skeletonTool.update();

        // 2. Vertex/Edge Overlays (Using local uiConfig)
        this.renderMeshOverlays();
        
        this.debugRenderer.render(this.currentViewProj);
    }
}