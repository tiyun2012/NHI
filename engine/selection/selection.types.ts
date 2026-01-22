import type { MeshComponentMode } from '@/types';

export type SubSelectionType = 'VERTEX' | 'EDGE' | 'FACE' | 'UV';
export type SelectionModifyAction = 'SET' | 'ADD' | 'REMOVE' | 'TOGGLE';
export type SelectionRectAction = 'SET' | 'ADD' | 'REMOVE';

export type SelectionSubSelection = {
  vertexIds: Set<number>;
  edgeIds: Set<string>;
  faceIds: Set<number>;
  uvIds: Set<number>;
};

export type SubSelectionStats = {
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  uvCount: number;
  lastVertex: number | null;
  lastFace: number | null;
};

export interface SelectionCommands {
  setSelected(ids: readonly string[]): void;
  clear(): void;

  modifySubSelection(
    type: SubSelectionType,
    ids: (number | string)[],
    action: SelectionModifyAction
  ): void;

  clearSubSelection(): void;

  selectLoop(mode: MeshComponentMode): void;

  selectInRect(
    rect: { x: number; y: number; w: number; h: number },
    mode: MeshComponentMode,
    action: SelectionRectAction
  ): void;

  focus(): void;
}

export interface SelectionQueries {
  getSelectedIds(): string[];
  getSubSelection(): SelectionSubSelection;
  getSubSelectionStats(): SubSelectionStats;
}
