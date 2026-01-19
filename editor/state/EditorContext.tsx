
import React from 'react';
import { Entity, ToolType, TransformSpace, SelectionType, GraphNode, GraphConnection, MeshComponentMode, SimulationMode, SoftSelectionFalloff, UIConfiguration, GridConfiguration, SnapSettings, SkeletonOptions } from '@/types';
import { SceneGraph } from '@/engine/SceneGraph';
import type { SoftSelectionMode } from '@/engine/engine';
import { DEFAULT_UI_CONFIG, DEFAULT_GRID_CONFIG, DEFAULT_SNAP_CONFIG } from '@/engine/config/defaults';

export type { UIConfiguration, GridConfiguration, SnapSettings };

export { DEFAULT_UI_CONFIG, DEFAULT_GRID_CONFIG, DEFAULT_SNAP_CONFIG };

// Alias SkeletonOptions to SkeletonVizSettings for backward compatibility with existing UI code
export type SkeletonVizSettings = SkeletonOptions;

export const DEFAULT_SKELETON_VIZ: SkeletonVizSettings = {
  enabled: true,
  drawJoints: true,
  drawBones: true,
  drawAxes: false,
  jointRadius: 10,
  rootScale: 1.6,
  boneColor: { r: 0.5, g: 0.5, b: 0.5 },
  rootColor: { r: 0.2, g: 1.0, b: 0.2 },
  border: 0.2
};


export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  
  // Entity Selection
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;

  // Asset Selection
  selectedAssetIds: string[];
  setSelectedAssetIds: (ids: string[]) => void;

  // Graph Node Selection (For Inspector/Spreadsheet)
  inspectedNode: GraphNode | null;
  setInspectedNode: (node: GraphNode | null) => void;
  activeGraphConnections: GraphConnection[];
  setActiveGraphConnections: (conns: GraphConnection[]) => void;
  updateInspectedNodeData: (key: string, value: any) => void;
  
  // Graph Sync (Inspector -> NodeGraph)
  onNodeDataChange: (nodeId: string, key: string, value: any) => void;
  setOnNodeDataChange: (cb: (nodeId: string, key: string, value: any) => void) => void;

  selectionType: SelectionType;
  setSelectionType: (type: SelectionType) => void;

  // Maya-style Mesh Interaction mode
  meshComponentMode: MeshComponentMode;
  setMeshComponentMode: (mode: MeshComponentMode) => void;

  // Soft Selection
  softSelectionEnabled: boolean;
  setSoftSelectionEnabled: (enabled: boolean) => void;
  softSelectionRadius: number;
  setSoftSelectionRadius: (radius: number) => void;
  softSelectionMode: SoftSelectionMode;
  setSoftSelectionMode: (mode: SoftSelectionMode) => void;
  softSelectionFalloff: SoftSelectionFalloff; // New
  setSoftSelectionFalloff: (type: SoftSelectionFalloff) => void; // New
  softSelectionHeatmapVisible: boolean;
  setSoftSelectionHeatmapVisible: (visible: boolean) => void;

  tool: ToolType;
  setTool: (tool: ToolType) => void;
  transformSpace: TransformSpace;
  setTransformSpace: (space: TransformSpace) => void;
  
  // Engine State
  isPlaying: boolean;
  simulationMode: SimulationMode; // New

  uiConfig: UIConfiguration;
  setUiConfig: (config: UIConfiguration) => void;

  gridConfig: GridConfiguration;
  setGridConfig: (config: GridConfiguration) => void;

  snapSettings: SnapSettings;
  setSnapSettings: (settings: SnapSettings) => void;

  // Skeleton visualization
  skeletonViz: SkeletonVizSettings;
  setSkeletonViz: (settings: SkeletonVizSettings) => void;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);
