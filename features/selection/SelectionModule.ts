
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { SELECTION_CHANGED } from './selection.events';

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
        ctx.engine.notifyUI();
      },
      clearSubSelection() {
        ctx.engine.selectionSystem.subSelection.vertexIds.clear();
        ctx.engine.selectionSystem.subSelection.edgeIds.clear();
        ctx.engine.selectionSystem.subSelection.faceIds.clear();
        ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
      },
      selectLoop(mode) {
        ctx.engine.selectionSystem.selectLoop(mode);
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
