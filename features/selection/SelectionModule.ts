
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { SELECTION_CHANGED } from './selection.events';

export const SelectionModule: EngineModule = {
  id: 'selection',

  init(ctx) {
    registerCommands(ctx, 'selection', {
      setSelected(ids) {
        ctx.engine.setSelected([...ids]);
        // Keep editor UI + soft-selection in sync
        if (ctx.engine.softSelectionEnabled) ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
        ctx.events.emit(SELECTION_CHANGED, { ids: [...ids] });
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
        const indices = ctx.engine.selectionSystem.selectedIndices;
        const ids: string[] = [];
        indices.forEach((idx: number) => {
          const id = ctx.engine.ecs.store.ids[idx];
          if (id) ids.push(id);
        });
        return ids;
      },
      getSubSelection() {
        return ctx.engine.selectionSystem.subSelection;
      }
    });
  },
};
