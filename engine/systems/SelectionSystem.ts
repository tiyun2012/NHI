
import { Mat4Utils, RayUtils, Vec3Utils, AABBUtils, AABB } from '../math';
import { COMPONENT_MASKS } from '../constants';
import { assetManager } from '../AssetManager';
import { StaticMeshAsset, MeshComponentMode, IEngine } from '@/types';
import { MeshTopologyUtils, MeshPickingResult } from '../MeshTopologyUtils';
import { consoleService } from '../Console';

export class SelectionSystem {
    engine: IEngine;
    selectedIndices = new Set<number>();
    subSelection = {
        vertexIds: new Set<number>(),
        edgeIds: new Set<string>(),
        faceIds: new Set<number>(),
        uvIds: new Set<number>()
    };
    hoveredVertex: { entityId: string, index: number } | null = null;

    constructor(engine: IEngine) {
        this.engine = engine;
    }

    setSelected(ids: string[]) {
        this.engine.clearDeformation(); 
        this.selectedIndices.clear();
        ids.forEach(id => {
            const idx = this.engine.ecs.idToIndex.get(id);
            if (idx !== undefined) this.selectedIndices.add(idx);
        });
        this.subSelection.vertexIds.clear(); 
        this.subSelection.edgeIds.clear(); 
        this.subSelection.faceIds.clear();
        this.subSelection.uvIds.clear();
        this.hoveredVertex = null;
        this.engine.recalculateSoftSelection(); 
    }

    modifySubSelection(type: 'VERTEX' | 'EDGE' | 'FACE' | 'UV', ids: (number | string)[], action: 'SET' | 'ADD' | 'REMOVE' | 'TOGGLE') {
        this.engine.clearDeformation(); 

        let targetSet: Set<any>;
        let validIds: any[];

        if (type === 'VERTEX') {
            targetSet = this.subSelection.vertexIds;
            validIds = ids.filter(id => typeof id === 'number');
        } else if (type === 'EDGE') {
            targetSet = this.subSelection.edgeIds;
            validIds = ids.filter(id => typeof id === 'string');
        } else if (type === 'FACE') {
            targetSet = this.subSelection.faceIds;
            validIds = ids.filter(id => typeof id === 'number');
        } else {
            targetSet = this.subSelection.uvIds;
            validIds = ids.filter(id => typeof id === 'number');
        }

        if (action === 'SET') {
            targetSet.clear();
            validIds.forEach(id => targetSet.add(id));
        } else if (action === 'ADD') {
            validIds.forEach(id => targetSet.add(id));
        } else if (action === 'REMOVE') {
            validIds.forEach(id => targetSet.delete(id));
        } else if (action === 'TOGGLE') {
            validIds.forEach(id => {
                if (targetSet.has(id)) targetSet.delete(id);
                else targetSet.add(id);
            });
        }

        this.engine.recalculateSoftSelection(true);
    }

    /**
     * Calculates the AABB of the current sub-selection (vertices/edges/faces) in local space.
     * Returns null if no sub-components are selected.
     */
    getSelectionAABB(): AABB | null {
        const selectedVerts = this.getSelectionAsVertices();
        if (selectedVerts.size === 0) return null;

        // Find the asset to get vertex positions
        if (this.selectedIndices.size === 0) return null;
        const idx = Array.from(this.selectedIndices)[0];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return null;
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset || !asset.geometry?.vertices) return null;

        const bounds = AABBUtils.create();
        const verts = asset.geometry.vertices;
        
        selectedVerts.forEach(vIdx => {
            AABBUtils.expandPoint(bounds, {
                x: verts[vIdx * 3],
                y: verts[vIdx * 3 + 1],
                z: verts[vIdx * 3 + 2]
            });
        });
        
        return bounds;
    }

    selectEntityAt(mx: number, my: number, width: number, height: number): string | null {
        if (!this.engine.currentViewProj) return null;
        
        const invVP = new Float32Array(16);
        if (!Mat4Utils.invert(this.engine.currentViewProj, invVP)) return null;

        const ray = RayUtils.create();
        RayUtils.fromScreen(mx, my, width, height, invVP, ray);

        let closestDist = Infinity;
        let closestId: string | null = null;

        for (let i = 0; i < this.engine.ecs.count; i++) {
            if (!this.engine.ecs.store.isActive[i]) continue;
            
            const mask = this.engine.ecs.store.componentMask[i];
            const hasMesh = !!(mask & COMPONENT_MASKS.MESH);
            
            if (!hasMesh && !((mask & COMPONENT_MASKS.LIGHT) || (mask & COMPONENT_MASKS.PARTICLE_SYSTEM) || (mask & COMPONENT_MASKS.VIRTUAL_PIVOT))) continue;

            const id = this.engine.ecs.store.ids[i];
            const wmOffset = i * 16;
            const worldMat = this.engine.ecs.store.worldMatrix.subarray(wmOffset, wmOffset + 16);
            
            let t: number | null = null;

            if (hasMesh) {
                const meshIntId = this.engine.ecs.store.meshType[i];
                const uuid = assetManager.meshIntToUuid.get(meshIntId);
                const asset = uuid ? assetManager.getAsset(uuid) as StaticMeshAsset : null;
                
                if (asset && asset.geometry.aabb) {
                    const invWorld = Mat4Utils.create();
                    if (Mat4Utils.invert(worldMat, invWorld)) {
                        const localRay = RayUtils.create();
                        Vec3Utils.transformMat4(ray.origin, invWorld, localRay.origin);
                        Vec3Utils.transformMat4Normal(ray.direction, invWorld, localRay.direction);
                        Vec3Utils.normalize(localRay.direction, localRay.direction);
                        
                        const aabbT = RayUtils.intersectAABB(localRay, asset.geometry.aabb);
                        
                        if (aabbT !== null) {
                            if (aabbT < closestDist) {
                                if (asset.topology && asset.topology.faces.length > 0) {
                                    const res = MeshTopologyUtils.raycastMesh(asset.topology, asset.geometry.vertices, localRay);
                                    if (res) {
                                        const worldHit = Vec3Utils.transformMat4(res.worldPos, worldMat, {x:0,y:0,z:0});
                                        t = Vec3Utils.distance(ray.origin, worldHit);
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                const pos = { x: worldMat[12], y: worldMat[13], z: worldMat[14] };
                t = RayUtils.intersectSphere(ray, pos, 0.5);
            }
            
            if (t !== null && t < closestDist) {
                closestDist = t;
                closestId = id;
            }
        }
        return closestId;
    }

    selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
        if (!this.engine.currentViewProj) return [];
        const ids: string[] = [];
        
        const selLeft = x; const selRight = x + w; const selTop = y; const selBottom = y + h;

        for (let i = 0; i < this.engine.ecs.count; i++) {
            if (!this.engine.ecs.store.isActive[i]) continue;
            
            const id = this.engine.ecs.store.ids[i];
            const mask = this.engine.ecs.store.componentMask[i];
            const hasMesh = !!(mask & COMPONENT_MASKS.MESH);
            
            const wmOffset = i * 16;
            const worldMatrix = this.engine.ecs.store.worldMatrix.subarray(wmOffset, wmOffset + 16);

            let screenMinX = Infinity, screenMinY = Infinity;
            let screenMaxX = -Infinity, screenMaxY = -Infinity;
            let pointsToCheck: {x:number, y:number, z:number}[] = [];

            if (hasMesh) {
                const meshIntId = this.engine.ecs.store.meshType[i];
                const uuid = assetManager.meshIntToUuid.get(meshIntId);
                const asset = uuid ? assetManager.getAsset(uuid) as StaticMeshAsset : null;
                
                if (asset && asset.geometry.aabb) {
                    const { min, max } = asset.geometry.aabb;
                    const localCorners = [
                        {x: min.x, y: min.y, z: min.z}, {x: max.x, y: min.y, z: min.z},
                        {x: min.x, y: max.y, z: min.z}, {x: max.x, y: max.y, z: min.z},
                        {x: min.x, y: min.y, z: max.z}, {x: max.x, y: min.y, z: max.z},
                        {x: min.x, y: max.y, z: max.z}, {x: max.x, y: max.y, z: max.z}
                    ];
                    pointsToCheck = localCorners.map(p => Vec3Utils.transformMat4(p, worldMatrix, {x:0,y:0,z:0}));
                }
            }

            if (pointsToCheck.length === 0) {
                pointsToCheck.push({ x: worldMatrix[12], y: worldMatrix[13], z: worldMatrix[14] });
            }

            let visiblePoints = 0;
            const m = this.engine.currentViewProj;

            for (const p of pointsToCheck) {
                const wVal = m[3]*p.x + m[7]*p.y + m[11]*p.z + m[15];
                if (wVal <= 0.001) continue; 

                const clip = Vec3Utils.transformMat4(p, m, {x:0, y:0, z:0});
                const sx = (clip.x * 0.5 + 0.5) * this.engine.currentWidth;
                const sy = (1.0 - (clip.y * 0.5 + 0.5)) * this.engine.currentHeight;

                screenMinX = Math.min(screenMinX, sx); screenMinY = Math.min(screenMinY, sy);
                screenMaxX = Math.max(screenMaxX, sx); screenMaxY = Math.max(screenMaxY, sy);
                visiblePoints++;
            }

            if (visiblePoints === 0) continue;

            const overlaps = !(screenMaxX < selLeft || screenMinX > selRight || screenMaxY < selTop || screenMinY > selBottom);
            if (overlaps) ids.push(id);
        }
        return ids;
    }

    pickMeshComponent(entityId: string, mx: number, my: number, width: number, height: number): MeshPickingResult | null {
        if (!this.engine.currentViewProj) return null;
        
        const idx = this.engine.ecs.idToIndex.get(entityId);
        if (idx === undefined) return null;
        
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return null;
        
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset || (asset.type !== 'MESH' && asset.type !== 'SKELETAL_MESH') || !asset.topology) return null;

        const worldMat = this.engine.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return null;

        const invWorld = Mat4Utils.create();
        if (!Mat4Utils.invert(worldMat, invWorld)) return null;

        const invVP = new Float32Array(16);
        Mat4Utils.invert(this.engine.currentViewProj, invVP);

        const rayWorld = RayUtils.create();
        RayUtils.fromScreen(mx, my, width, height, invVP, rayWorld);

        const rayLocal = RayUtils.create();
        Vec3Utils.transformMat4(rayWorld.origin, invWorld, rayLocal.origin);
        Vec3Utils.transformMat4Normal(rayWorld.direction, invWorld, rayLocal.direction);
        Vec3Utils.normalize(rayLocal.direction, rayLocal.direction);

        const result = MeshTopologyUtils.raycastMesh(asset.topology, asset.geometry.vertices, rayLocal);
        
        if (result) {
            Vec3Utils.transformMat4(result.worldPos, worldMat, result.worldPos);
            return result;
        }
        return null;
    }

    highlightVertexAt(mx: number, my: number, w: number, h: number) {
        // Highlight logic applies to VERTEX and UV modes
        if ((this.engine.meshComponentMode !== 'VERTEX' && this.engine.meshComponentMode !== 'UV') || this.selectedIndices.size === 0 || !this.engine.currentViewProj) {
            this.hoveredVertex = null;
            return;
        }

        const idx = Array.from(this.selectedIndices)[0];
        const entityId = this.engine.ecs.store.ids[idx];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        const asset = assetManager.getAsset(assetUuid!) as StaticMeshAsset;
        
        if (!asset || !asset.topology) return;

        const pick = this.pickMeshComponent(entityId, mx, my, w, h);
        
        if (pick) {
            // Compare distances in world space (pick.worldPos is returned in world space).
            const localV = {
                x: asset.geometry.vertices[pick.vertexId * 3],
                y: asset.geometry.vertices[pick.vertexId * 3 + 1],
                z: asset.geometry.vertices[pick.vertexId * 3 + 2],
            };
            const wm = this.engine.sceneGraph.getWorldMatrix(entityId);
            const vWorld = wm ? Vec3Utils.transformMat4(localV, wm, { x: 0, y: 0, z: 0 }) : localV;

            const dist = Vec3Utils.distance(pick.worldPos, vWorld);
            if (dist < 0.2) {
                this.hoveredVertex = { entityId, index: pick.vertexId };
                return;
            }
        }
        
        this.hoveredVertex = null;
    }

    /**
     * Marquee selection for vertices in the currently selected mesh.
     * Returns the list of vertex indices whose projected screen position overlaps the rect.
     */
    selectVerticesInRect(x: number, y: number, w: number, h: number): number[] {
        // Vertex selection logic applies to VERTEX and UV modes
        if ((this.engine.meshComponentMode !== 'VERTEX' && this.engine.meshComponentMode !== 'UV') || this.selectedIndices.size === 0 || !this.engine.currentViewProj) return [];

        const idx = Array.from(this.selectedIndices)[0];
        const entityId = this.engine.ecs.store.ids[idx];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return [];
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset?.geometry?.vertices) return [];

        const worldMat = this.engine.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return [];

        const selLeft = x;
        const selRight = x + w;
        const selTop = y;
        const selBottom = y + h;

        const vp = this.engine.currentViewProj;
        const verts = asset.geometry.vertices;
        const out: number[] = [];

        // Unroll world matrix for speed.
        const m0 = worldMat[0], m1 = worldMat[1], m2 = worldMat[2], m12 = worldMat[12];
        const m4 = worldMat[4], m5 = worldMat[5], m6 = worldMat[6], m13 = worldMat[13];
        const m8 = worldMat[8], m9 = worldMat[9], m10 = worldMat[10], m14 = worldMat[14];

        const vw = this.engine.currentWidth;
        const vh = this.engine.currentHeight;

        for (let i = 0; i < verts.length / 3; i++) {
            const lx = verts[i * 3];
            const ly = verts[i * 3 + 1];
            const lz = verts[i * 3 + 2];

            const wx = m0 * lx + m4 * ly + m8 * lz + m12;
            const wy = m1 * lx + m5 * ly + m9 * lz + m13;
            const wz = m2 * lx + m6 * ly + m10 * lz + m14;

            const wClip = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
            if (wClip <= 0.001) continue;

            const invW = 1.0 / wClip;
            const ndcX = (vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12]) * invW;
            const ndcY = (vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13]) * invW;

            const sx = (ndcX * 0.5 + 0.5) * vw;
            const sy = (1.0 - (ndcY * 0.5 + 0.5)) * vh;

            if (sx >= selLeft && sx <= selRight && sy >= selTop && sy <= selBottom) out.push(i);
        }

        return out;
    }

    selectVerticesInBrush(mx: number, my: number, width: number, height: number, add: boolean = true) {
        if (this.selectedIndices.size === 0 || !this.engine.currentViewProj) return;

        const idx = Array.from(this.selectedIndices)[0];
        const entityId = this.engine.ecs.store.ids[idx];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const asset = assetManager.getAsset(assetManager.meshIntToUuid.get(meshIntId)!) as StaticMeshAsset;

        if (!asset || !asset.topology) return;

        const worldMat = this.engine.sceneGraph.getWorldMatrix(entityId);
        if (!worldMat) return;

        const pick = this.pickMeshComponent(entityId, mx, my, width, height);
        if (!pick) return;

        const scale = Math.max(this.engine.ecs.store.scaleX[idx], this.engine.ecs.store.scaleY[idx]);
        const localRadius = (this.engine.softSelectionRadius * 0.5) / scale; 

        const vertices = MeshTopologyUtils.getVerticesInWorldSphere(
            asset.topology, 
            asset.geometry.vertices, 
            pick.worldPos, 
            localRadius
        );

        if (this.engine.meshComponentMode === 'VERTEX') {
            if (add) vertices.forEach(v => this.subSelection.vertexIds.add(v));
            else vertices.forEach(v => this.subSelection.vertexIds.delete(v));
        } else if (this.engine.meshComponentMode === 'UV') {
            if (add) vertices.forEach(v => this.subSelection.uvIds.add(v));
            else vertices.forEach(v => this.subSelection.uvIds.delete(v));
        }
        
        this.engine.recalculateSoftSelection();
        this.engine.notifyUI();
    }

    selectLoop(mode: MeshComponentMode) {
        if (this.selectedIndices.size === 0) return;
        const idx = Array.from(this.selectedIndices)[0];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        const asset = assetManager.getAsset(assetUuid!) as StaticMeshAsset;
        if (!asset || !asset.topology) return;

        const topo = asset.topology;

        if (mode === 'EDGE') {
            const edges = Array.from(this.subSelection.edgeIds);
            if (edges.length === 0) return;
            const lastEdge = edges[edges.length - 1];
            const [v1, v2] = lastEdge.split('-').map(Number);
            
            const loop = MeshTopologyUtils.getEdgeLoop(topo, v1, v2);
            
            if (loop.length === 0) {
                consoleService.warn("No loop found. Mesh topology might be disconnected at UVs/Normals.", "SelectionSystem");
            } else {
                consoleService.success(`Selected Edge Loop (${loop.length} edges)`, "SelectionSystem");
            }

            loop.forEach(e => {
                const key = e.sort((a,b)=>a-b).join('-');
                this.subSelection.edgeIds.add(key);
            });
        } 
        else if (mode === 'VERTEX' || mode === 'UV') {
            const verts = Array.from(mode === 'UV' ? this.subSelection.uvIds : this.subSelection.vertexIds);
            if (verts.length < 2) {
                consoleService.warn('Select at least 2 vertices to define loop direction', "SelectionSystem");
                return;
            }
            // Sort by insertion order is not guaranteed in Set but usually stable. 
            // Better to assume user clicked last two.
            const v1 = verts[verts.length - 2];
            const v2 = verts[verts.length - 1];
            const key = [v1, v2].sort((a,b)=>a-b).join('-');
            
            if (topo.graph && topo.graph.edgeKeyToHalfEdge.has(key)) {
                const loop = MeshTopologyUtils.getVertexLoop(topo, v1, v2);
                loop.forEach(v => {
                    if (mode === 'UV') this.subSelection.uvIds.add(v);
                    else this.subSelection.vertexIds.add(v);
                });
                consoleService.success(`Selected Vertex Loop`, "SelectionSystem");
            } else {
                consoleService.warn('Selected vertices are not connected', "SelectionSystem");
            }
        } 
        else if (mode === 'FACE') {
            const faces = Array.from(this.subSelection.faceIds);
            if (faces.length < 2) {
                consoleService.warn('Select at least 2 adjacent faces to define loop direction', "SelectionSystem");
                return;
            }
            const f1 = faces[faces.length - 2];
            const f2 = faces[faces.length - 1];
            
            const verts1 = topo.faces[f1];
            const verts2 = topo.faces[f2];
            const shared = verts1.filter(v => verts2.includes(v));
            
            if (shared.length >= 2) { 
                const loop = MeshTopologyUtils.getFaceLoop(topo, shared[0], shared[1]);
                loop.forEach(f => this.subSelection.faceIds.add(f));
                consoleService.success(`Selected Face Loop`, "SelectionSystem");
            } else {
                consoleService.warn('Faces are not adjacent', "SelectionSystem");
            }
        }
        
        this.engine.recalculateSoftSelection();
        this.engine.notifyUI();
    }

    getSelectionAsVertices(): Set<number> {
        if (this.selectedIndices.size === 0) return new Set();
        const idx = Array.from(this.selectedIndices)[0];
        const meshIntId = this.engine.ecs.store.meshType[idx];
        const assetUuid = assetManager.meshIntToUuid.get(meshIntId);
        if (!assetUuid) return new Set();
        const asset = assetManager.getAsset(assetUuid) as StaticMeshAsset;
        if (!asset) return new Set();

        const result = new Set<number>();

        if (this.engine.meshComponentMode === 'VERTEX') {
            return this.subSelection.vertexIds;
        }
        if (this.engine.meshComponentMode === 'UV') {
            return this.subSelection.uvIds;
        }
        if (this.engine.meshComponentMode === 'EDGE') {
            this.subSelection.edgeIds.forEach(key => {
                const [vA, vB] = key.split('-').map(Number);
                result.add(vA); result.add(vB);
            });
        }
        if (this.engine.meshComponentMode === 'FACE') {
            const topo = asset.topology;
            if (topo) {
                this.subSelection.faceIds.forEach(fIdx => {
                    topo.faces[fIdx].forEach(v => result.add(v));
                });
            } else {
                const indices = asset.geometry.indices;
                this.subSelection.faceIds.forEach(fIdx => {
                    result.add(indices[fIdx * 3]);
                    result.add(indices[fIdx * 3 + 1]);
                    result.add(indices[fIdx * 3 + 2]);
                });
            }
        }
        return result;
    }
}
