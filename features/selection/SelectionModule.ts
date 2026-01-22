
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { createSelectionCommands, createSelectionQueries } from '@/engine/selection';
import { SELECTION_CHANGED } from '@/engine/selection/selection.events';

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
    registerCommands(ctx, 'selection', createSelectionCommands(ctx.engine, { emit: (e, p) => ctx.events.emit(e, p), notifyUI: () => ctx.engine.notifyUI() }));

    registerQueries(ctx, 'selection', createSelectionQueries(ctx.engine));

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
