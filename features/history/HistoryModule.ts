
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';

export const HistoryModule: EngineModule = {
  id: 'history',

  init(ctx) {
    registerCommands(ctx, 'history', {
      pushState() {
        ctx.engine.historySystem.pushState(ctx.engine.ecs);
      },
      undo() {
        if (ctx.engine.historySystem.undo(ctx.engine.ecs, ctx.engine.sceneGraph)) {
          ctx.engine.notifyUI();
        }
      },
      redo() {
        if (ctx.engine.historySystem.redo(ctx.engine.ecs, ctx.engine.sceneGraph)) {
          ctx.engine.notifyUI();
        }
      }
    });
  }
};
