
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { SELECTION_CHANGED } from './selection.events';

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

function keyFromNumberSet(set: Set<number>): string {
  const size = set.size;
  if (size === 0) return '0:';
  if (size <= 24) {
    const arr = Array.from(set);
    arr.sort((a, b) => a - b);
    return `${size}:${arr.join(',')}`;
  }
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of set) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return `${size}:${min}:${max}:${sum}`;
}

function keyFromStringSet(set: Set<string>): string {
  const size = set.size;
  if (size === 0) return '0:';
  if (size <= 24) {
    const arr = Array.from(set);
    arr.sort();
    return `${size}:${arr.join(',')}`;
  }
  let min = '', max = '';
  let i = 0;
  for (const v of set) {
    if (i === 0) {
      min = v;
      max = v;
    } else {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    i++;
  }
  return `${size}:${min}:${max}`;
}


const offByEngine = new WeakMap<object, () => void>();

export const SelectionModule: EngineModule = {
  id: 'selection',

  init(ctx) {
    registerCommands(ctx, 'selection', {
      setSelected(ids) {
        ctx.engine.setSelected([...ids]);
        if (ctx.engine.softSelectionEnabled) ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
        ctx.events.emit(SELECTION_CHANGED, { ids: [...ids] });
      },
      modifySubSelection(type, ids, action) {
        ctx.engine.selectionSystem.modifySubSelection(type, ids, action);
        ctx.events.emit('selection:subChanged', undefined);
        ctx.engine.notifyUI();
      },
      clearSubSelection() {
        ctx.engine.selectionSystem.subSelection.vertexIds.clear();
        ctx.engine.selectionSystem.subSelection.edgeIds.clear();
        ctx.engine.selectionSystem.subSelection.faceIds.clear();
        ctx.engine.selectionSystem.subSelection.uvIds.clear();
        ctx.engine.recalculateSoftSelection(true);
        ctx.events.emit('selection:subChanged', undefined);
        ctx.engine.notifyUI();
      },
      selectLoop(mode) {
        ctx.engine.selectionSystem.selectLoop(mode);
        ctx.events.emit('selection:subChanged', undefined);
      },
      selectInRect(rect, mode, action) {
        if (mode === 'OBJECT') {
          const hits = ctx.engine.selectionSystem.selectEntitiesInRect(rect.x, rect.y, rect.w, rect.h);

          let finalIds = hits;
          if (action === 'ADD') {
            const current = Array.from(ctx.engine.selectionSystem.selectedIndices).map((idx) => ctx.engine.ecs.store.ids[idx]);
            finalIds = Array.from(new Set([...current, ...hits]));
          }

          ctx.engine.setSelected(finalIds);
          ctx.events.emit(SELECTION_CHANGED, { ids: finalIds });
        } else if (mode === 'VERTEX' || mode === 'UV') {
          const indices = ctx.engine.selectionSystem.selectVerticesInRect(rect.x, rect.y, rect.w, rect.h);
          const type = mode === 'UV' ? 'UV' : 'VERTEX';
          if (indices.length > 0) {
            ctx.engine.selectionSystem.modifySubSelection(type, indices, action === 'ADD' ? 'ADD' : 'SET');
            ctx.events.emit('selection:subChanged', undefined);
          } else if (action === 'SET') {
            ctx.engine.selectionSystem.modifySubSelection(type, [], 'SET');
            ctx.events.emit('selection:subChanged', undefined);
          }
        }
        ctx.engine.notifyUI();
      },
      focus() {
        ctx.events.emit('selection:focus', undefined);
      },
      clear() {
        ctx.engine.setSelected([]);
        if (ctx.engine.softSelectionEnabled) ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
        ctx.events.emit(SELECTION_CHANGED, { ids: [] });
      },
    });

    registerQueries(ctx, 'selection', {
      getSelectedIds() {
        return getSelectedIdsFromEngine(ctx.engine);
      },
      getSubSelectionStats() {
        const sub = ctx.engine.selectionSystem.subSelection;
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
        return ctx.engine.selectionSystem.subSelection;
      },
    });

    let lastSelectionKey = '';
    let lastSubKey = '';

    const sync = () => {
      const ids = getSelectedIdsFromEngine(ctx.engine);
      const key = ids.join('|');
      if (key !== lastSelectionKey) {
        lastSelectionKey = key;
        ctx.events.emit(SELECTION_CHANGED, { ids });
      }

      const sub = ctx.engine.selectionSystem.subSelection;
      const subKey = [
        keyFromNumberSet(sub.vertexIds),
        keyFromStringSet(sub.edgeIds),
        keyFromNumberSet(sub.faceIds),
        keyFromNumberSet(sub.uvIds)
      ].join('||');

      if (subKey !== lastSubKey) {
        lastSubKey = subKey;
        ctx.events.emit('selection:subChanged', undefined);
      }
    };

    sync();

    const prev = offByEngine.get(ctx.engine as any);
    prev?.();

    const off = ctx.engine.subscribe(sync);
    offByEngine.set(ctx.engine as any, off);
  },

  dispose(ctx) {
    const off = offByEngine.get(ctx.engine as any);
    off?.();
    offByEngine.delete(ctx.engine as any);
  },
};
