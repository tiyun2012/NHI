
import type { SimulationMode, MeshComponentMode, ComponentType, EngineModule } from '@/types';
import type { SoftSelectionMode } from '@/engine/systems/DeformationSystem';
import type { SoftSelectionFalloff } from '@/types';

export interface EngineCommands {
  selection: {
    setSelected(ids: readonly string[]): void;
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
