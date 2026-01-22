import type { MeshComponentMode } from '@/types';
import type { SelectionCommands, SelectionQueries, SelectionSubSelection } from './selection.types';
import { SELECTION_CHANGED } from './selection.events';

/**
 * Shared selection bindings used by:
 * - Engine feature module (SelectionModule)
 * - Local/standalone editors (asset viewport, UV editor)
 *
 * Goal: a single, consistent abstraction for selection across engine/editor/modules.
 */
export function createSelectionCommands(engine: any, opts?: {
  emit?: (event: string, payload: any) => void;
  notifyUI?: () => void;
}): SelectionCommands {
  const emit = opts?.emit ?? (() => {});
  const notifyUI = opts?.notifyUI ?? (() => {});

  return {
    setSelected(ids) {
      engine.setSelected([...ids]);
      if (engine.softSelectionEnabled) engine.recalculateSoftSelection(true);
      notifyUI();
      emit(SELECTION_CHANGED, { ids: [...ids] });
    },

    clear() {
      engine.setSelected([]);
      if (engine.softSelectionEnabled) engine.recalculateSoftSelection(true);
      notifyUI();
      emit(SELECTION_CHANGED, { ids: [] });
    },

    modifySubSelection(type, ids, action) {
      engine.selectionSystem.modifySubSelection(type, ids, action);
      emit('selection:subChanged', undefined);
      notifyUI();
    },

    clearSubSelection() {
      const sub = engine.selectionSystem.subSelection as SelectionSubSelection;
      sub.vertexIds.clear();
      sub.edgeIds.clear();
      sub.faceIds.clear();
      sub.uvIds.clear();
      engine.recalculateSoftSelection(true);
      emit('selection:subChanged', undefined);
      notifyUI();
    },

    selectLoop(mode: MeshComponentMode) {
      engine.selectionSystem.selectLoop(mode);
      emit('selection:subChanged', undefined);
      notifyUI();
    },

    selectInRect(rect, mode, action) {
      if (mode === 'OBJECT') {
        const hits: string[] = engine.selectionSystem.selectEntitiesInRect(rect.x, rect.y, rect.w, rect.h);

        let finalIds = hits;
        if (action === 'ADD') {
          const current = Array.from(engine.selectionSystem.selectedIndices)
            .map((idx: number) => engine.ecs.store.ids[idx])
            .filter(Boolean);
          finalIds = Array.from(new Set([...current, ...hits]));
        }

        engine.setSelected(finalIds);
        emit(SELECTION_CHANGED, { ids: finalIds });
      } else if (mode === 'VERTEX' || mode === 'UV') {
        const indices: number[] = engine.selectionSystem.selectVerticesInRect(rect.x, rect.y, rect.w, rect.h);
        const type = mode === 'UV' ? 'UV' : 'VERTEX';

        if (indices.length > 0) {
          engine.selectionSystem.modifySubSelection(type, indices, action === 'ADD' ? 'ADD' : 'SET');
          emit('selection:subChanged', undefined);
        } else if (action === 'SET') {
          engine.selectionSystem.modifySubSelection(type, [], 'SET');
          emit('selection:subChanged', undefined);
        }
      }

      notifyUI();
    },

    focus() {
      emit('selection:focus', undefined);
    },
  };
}

function getSelectedIdsFromEngine(engine: any): string[] {
  const indices: Set<number> = engine.selectionSystem.selectedIndices;
  const ids: string[] = [];
  indices.forEach((idx) => {
    const id = engine.ecs.store.ids[idx];
    if (id) ids.push(id);
  });
  ids.sort();
  return ids;
}

export function createSelectionQueries(engine: any): SelectionQueries {
  return {
    getSelectedIds() {
      return getSelectedIdsFromEngine(engine);
    },

    getSubSelectionStats() {
      const sub = engine.selectionSystem.subSelection as SelectionSubSelection;
      const lastVertex = sub.vertexIds.size ? Array.from(sub.vertexIds.values()).pop() ?? null : null;
      const lastFace = sub.faceIds.size ? Array.from(sub.faceIds.values()).pop() ?? null : null;

      return {
        vertexCount: sub.vertexIds.size,
        edgeCount: sub.edgeIds.size,
        faceCount: sub.faceIds.size,
        uvCount: sub.uvIds.size,
        lastVertex,
        lastFace,
      };
    },

    getSubSelection() {
      return engine.selectionSystem.subSelection as SelectionSubSelection;
    },
  };
}
