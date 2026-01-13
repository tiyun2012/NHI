
import { SimulationMode, MeshComponentMode } from '@/types';

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
  };
}

export interface EngineEvents {
  'selection:changed': { ids: string[] };
  'scene:entityCreated': { id: string };
  'scene:entityDestroyed': { id: string };
  // Fallback for legacy string events
  [key: string]: any;
}

export interface EngineQueries {
  selection: {
    getSelectedIds(): string[];
  };
}

export type EngineAPI = {
  commands: EngineCommands;
  queries: EngineQueries;
  subscribe<E extends keyof EngineEvents>(event: E, cb: (payload: EngineEvents[E]) => void): () => void;
};
