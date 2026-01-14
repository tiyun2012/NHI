
import type { SimulationMode, MeshComponentMode, ComponentType, EngineModule } from '@/types';
import type { SoftSelectionMode } from '@/engine/systems/DeformationSystem';
import type { SoftSelectionFalloff } from '@/types';

export interface EngineCommands {
  selection: {
    setSelected(ids: readonly string[]): void;
    
    /**
     * Modify the sub-object selection (Vertices, Edges, Faces).
     * @param type - The component type ('VERTEX', 'EDGE', 'FACE')
     * @param ids - Array of indices (for vertex/face) or keys (for edge 'v1-v2')
     * @param action - 'SET' (replace), 'ADD' (union), 'REMOVE' (subtract), 'TOGGLE' (xor)
     */
    modifySubSelection(type: 'VERTEX' | 'EDGE' | 'FACE', ids: (number | string)[], action: 'SET' | 'ADD' | 'REMOVE' | 'TOGGLE'): void;
    
    /**
     * Clear all sub-object selection.
     */
    clearSubSelection(): void;

    /**
     * Perform a loop selection based on current selection state.
     */
    selectLoop(mode: MeshComponentMode): void;
    
    clear(): void;
  };
  simulation: {
    setMode(mode: SimulationMode): void;
  };
  mesh: {
    setComponentMode(mode: MeshComponentMode): void;
  };
  scene: {
    createEntity(name: string): string;
    deleteEntity(id: string): void;
    renameEntity(id: string, name: string): void;
    reparentEntity(childId: string, parentId: string | null): void;
    addComponent(id: string, type: string): void;
    removeComponent(id: string, type: string): void;
  };
  history: {
    pushState(): void;
    undo(): void;
    redo(): void;
  };
  ui: {
    notify(): void;
  };
  sculpt: {
    setEnabled(enabled: boolean): void;
    setRadius(radius: number): void;
    setMode(mode: SoftSelectionMode): void;
    setFalloff(falloff: SoftSelectionFalloff): void;
    setHeatmapVisible(visible: boolean): void;
  };
}

export interface EngineQueries {
  selection: {
    getSelectedIds(): string[];
    getSubSelection(): { vertexIds: Set<number>; edgeIds: Set<string>; faceIds: Set<number> };
  };
  registry: {
    getModules(): EngineModule[];
  };
}

export interface EngineEvents {
  'selection:changed': { ids: string[] };
  'simulation:modeChanged': { mode: SimulationMode };
  'scene:entityCreated': { id: string; name?: string };
  'scene:entityDeleted': { id: string };
  'scene:entityRenamed': { id: string; name: string };
  'component:added': { id: string; type: ComponentType };
  'component:removed': { id: string; type: ComponentType };
  [key: string]: any; 
}

export type EngineAPI = {
  commands: EngineCommands;
  queries: EngineQueries;

  subscribe<E extends keyof EngineEvents>(
    event: E | string,
    cb: (payload: any) => void
  ): () => void;
};
