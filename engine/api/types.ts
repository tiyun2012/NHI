
import type { SimulationMode, MeshComponentMode } from '@/types';

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

export interface EngineQueries {
  selection: {
    getSelectedIds(): string[];
  };
}

export interface EngineEvents {
  'selection:changed': { ids: string[] };
  'simulation:modeChanged': { mode: SimulationMode };
  'scene:entityCreated': { id: string; name?: string };
  'scene:entityDeleted': { id: string };
  'scene:entityRenamed': { id: string; name: string };
  [key: string]: any; // Fallback for legacy/untyped events
}

export type EngineAPI = {
  commands: EngineCommands;
  queries: EngineQueries;

  subscribe<E extends keyof EngineEvents>(
    event: E,
    cb: (payload: EngineEvents[E]) => void
  ): () => void;

  subscribe(event: string, cb: (payload: any) => void): () => void;
};
