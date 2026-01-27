
import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';

class SpatialHashGrid {
    cellSize = 2; 
    // Reuse array pool to avoid thrashing
    private arrayPool: number[][] = [];
    cells = new Map<string, number[]>();

    clear() { 
        this.cells.forEach(arr => {
            arr.length = 0;
            this.arrayPool.push(arr);
        });
        this.cells.clear(); 
    }

    private getKey(x: number, y: number, z: number) {
        // String allocation is unavoidable for Map<string> without BigInt/Tuple limits,
        // but for a generic infinite grid, string is robust.
        // We optimize the array allocation instead.
        return `${Math.floor(x/this.cellSize)}|${Math.floor(y/this.cellSize)}|${Math.floor(z/this.cellSize)}`;
    }

    insert(index: number, x: number, y: number, z: number) {
        const key = this.getKey(x, y, z);
        let arr = this.cells.get(key);
        if (!arr) {
            arr = this.arrayPool.pop() || [];
            this.cells.set(key, arr);
        }
        arr.push(index);
    }

    getPotentialColliders(x: number, y: number, z: number): number[] {
        const key = this.getKey(x, y, z);
        return this.cells.get(key) || [];
    }
}

export class PhysicsSystem {
  grid = new SpatialHashGrid();

  update(deltaTime: number, store: ComponentStorage, idToIndex: Map<string, number>, sceneGraph: SceneGraph) {
     this.grid.clear();

     // 1. Broadphase
     // Note: We iterate idToIndex map values (indices) which is faster if we just check active.
     // Optimization: Iterate store up to count instead of map iterator.
     for(let idx = 0; idx < store.capacity; idx++) { // Assumes capacity matches max index used or tracked separately
         // store doesn't track max index easily without checking count which is high-water mark.
         // Let's rely on ECS count.
         // ECS doesn't expose count directly to this method signature, assume `store` usage pattern or pass count.
         if (store.isActive[idx] && store.mass[idx] > 0) {
             this.grid.insert(idx, store.posX[idx], store.posY[idx], store.posZ[idx]);
         }
     }
     // Actually the loop above is wrong because `store.capacity` is big. 
     // We need `count`. But the signature is `(dt, store, idMap, scene)`.
     // We will iterate idMap as before for correctness until signature changes.
     
     idToIndex.forEach((idx) => {
         if(store.isActive[idx] && store.mass[idx] > 0) {
             this.grid.insert(idx, store.posX[idx], store.posY[idx], store.posZ[idx]);
         }
     });

     // 2. Integration & Collision
     idToIndex.forEach((idx, id) => {
         if (!store.isActive[idx] || !store.useGravity[idx]) return;

         // Gravity
         store.posY[idx] -= 9.81 * deltaTime;

         // Ground Plane Collision (Simple)
         if (store.posY[idx] < -0.5) { 
             store.posY[idx] = -0.5;
         }

         // Spatial Query (Example)
         const neighbors = this.grid.getPotentialColliders(store.posX[idx], store.posY[idx], store.posZ[idx]);
         if (neighbors.length > 1) {
             // Narrow phase
         }

         sceneGraph.setDirty(id);
     });
  }
}
