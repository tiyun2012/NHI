import type { EngineAPI } from './EngineAPI';
import type { EngineContext } from '@/engine/core/EngineContext';
import type { SimulationMode, MeshComponentMode } from '@/types';

export function createEngineAPI(ctx: EngineContext): EngineAPI {
  return {
    commands: {
      selection: {
        setSelected(ids: string[]) {
          ctx.engine.setSelected(ids);
        },
        clear() {
          ctx.engine.setSelected([]);
        },
      },
      simulation: {
        setMode(mode: SimulationMode) {
          ctx.engine.simulationMode = mode;
          ctx.engine.notifyUI();
        },
      },
      mesh: {
        setComponentMode(mode: MeshComponentMode) {
          ctx.engine.meshComponentMode = mode;
          ctx.engine.notifyUI();
        },
      },
    },

    subscribe(event: string, cb: (payload: any) => void) {
      ctx.events.on(event, cb);
      return () => ctx.events.off(event, cb);
    },

    getSelectedIds() {
      const indices = ctx.engine.selectionSystem.selectedIndices;
      const ids: string[] = [];
      indices.forEach((idx: number) => {
        const id = ctx.engine.ecs.store.ids[idx];
        if (id) ids.push(id);
      });
      return ids;
    },
  };
}
