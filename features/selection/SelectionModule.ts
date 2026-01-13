
import type { EngineModule } from "@/engine/core/EngineModule";
import type { EngineContext } from "@/engine/core/EngineContext";
import { SELECTION_CHANGED } from "./selection.events";

export const SelectionModule: EngineModule = {
  id: "selection",
  init(ctx: EngineContext) {
    // Commands
    ctx.commands.selection = {
      setSelected(ids: readonly string[]) {
        ctx.engine.setSelected([...ids]);
        ctx.events.emit(SELECTION_CHANGED, { ids: [...ids] });
      },
      clear() {
        ctx.engine.setSelected([]);
        ctx.events.emit(SELECTION_CHANGED, { ids: [] });
      },
    };

    // Queries
    ctx.queries.selection = {
      getSelectedIds() {
        const indices = ctx.engine.selectionSystem.selectedIndices;
        const ids: string[] = [];
        indices.forEach((idx: number) => {
          const id = ctx.engine.ecs.store.ids[idx];
          if (id) ids.push(id);
        });
        return ids;
      }
    };
  },
};
