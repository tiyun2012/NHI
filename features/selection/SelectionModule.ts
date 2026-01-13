
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';

export const SelectionModule: EngineModule = {
  id: 'selection',

  init(ctx) {
    registerCommands(ctx, 'selection', {
      setSelected(ids) {
        ctx.engine.setSelected([...ids]);
        ctx.events.emit('selection:changed', { ids: [...ids] });
      },
      clear() {
        ctx.engine.setSelected([]);
        ctx.events.emit('selection:changed', { ids: [] });
      },
    });

    registerQueries(ctx, 'selection', {
      getSelectedIds() {
        const indices = ctx.engine.selectionSystem.selectedIndices;
        const ids: string[] = [];
        indices.forEach((idx: number) => {
          const id = ctx.engine.ecs.store.ids[idx];
          if (id) ids.push(id);
        });
        return ids;
      },
    });
  },
};
