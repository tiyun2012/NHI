
// Add missing React import for ComponentType namespace
import React from 'react';
import type { SimulationMode, MeshComponentMode, ComponentType, EngineModule, SkeletonOptions, Asset, StaticMeshAsset } from '@/types';
import type { SoftSelectionMode } from '@/engine/systems/DeformationSystem';
import type { SoftSelectionFalloff } from '@/types';

export interface EngineCommands {
  selection: {
    setSelected(ids: readonly string[]): void;
    clear(): void;
    modifySubSelection(type: 'VERTEX' | 'EDGE' | 'FACE', ids: (number | string)[], action: 'SET' | 'ADD' | 'REMOVE' | 'TOGGLE'): void;
    clearSubSelection(): void;
    selectLoop(mode: MeshComponentMode): void;
    selectInRect(rect: { x: number; y: number; w: number; h: number }, mode: MeshComponentMode, action: 'SET' | 'ADD' | 'REMOVE'): void;
    /** Focus camera on current selection center */
    focus(): void;
  };
  simulation: {
    setMode(mode: SimulationMode): void;
  };
  mesh: {
    setComponentMode(mode: MeshComponentMode): void;
    /** Update mesh asset geometry and notify renderers */
    updateAssetGeometry(assetId: string, geometry: Partial<StaticMeshAsset['geometry']>): void;
  };
  scene: {
    createEntity(name: string): string;
    deleteEntity(id: string): void;
    duplicateEntity(id: string): void;
    renameEntity(id: string, name: string): void;
    reparentEntity(childId: string, parentId: string | null): void;
    addComponent(id: string, type: string): void;
    removeComponent(id: string, type: string): void;
    createEntityFromAsset(assetId: string, pos: { x: number; y: number; z: number }): string | null;
    loadSceneFromAsset(assetId: string): void;
  };
  modeling: {
    extrudeFaces(): void;
    bevelEdges(): void;
    weldVertices(): void;
    connectComponents(): void;
    deleteSelectedFaces(): void;
  };
  history: {
    pushState(): void;
    undo(): void;
    redo(): void;
  };
  ui: {
    notify(): void;
    /**
     * Register a reusable UI section (Widget) via the API.
     * Host panels (Inspector, ToolOptions) will render these dynamically.
     */
    registerSection(location: 'TOOL_OPTIONS' | 'INSPECTOR' | 'GLOBAL', config: {
        id: string;
        title: string;
        icon?: string;
        component: React.ComponentType;
        order: number;
    }): void;
  };
  sculpt: {
    setEnabled(enabled: boolean): void;
    setRadius(radius: number): void;
    setMode(mode: SoftSelectionMode): void;
    setFalloff(falloff: SoftSelectionFalloff): void;
    setHeatmapVisible(visible: boolean): void;
  };
  skeleton: {
    setOptions(options: Partial<SkeletonOptions>): void;
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
  skeleton: {
    getOptions(): SkeletonOptions;
  };
  mesh: {
    /** Retrieve the asset associated with an entity's Mesh component */
    getAssetByEntity(entityId: string): Asset | null;
  };
}

export interface EngineEvents {
  'selection:changed': { ids: string[] };
  'selection:focus': void;
  'simulation:modeChanged': { mode: SimulationMode };
  'scene:entityCreated': { id: string; name?: string };
  'scene:entityDeleted': { id: string };
  'scene:entityRenamed': { id: string; name: string };
  'component:added': { id: string; type: ComponentType };
  'component:removed': { id: string; type: ComponentType };
  'ui:registryChanged': void;
  [key: string]: any; 
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
