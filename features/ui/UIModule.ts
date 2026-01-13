
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { moduleManager } from '@/engine/ModuleManager';

export const UIModule: EngineModule = {
  id: 'ui',

  init(ctx) {
    registerCommands(ctx, 'ui', {
      notify() {
        ctx.engine.notifyUI();
      }
    });

    registerQueries(ctx, 'registry', {
      getModules() {
        return moduleManager.getAllModules();
      }
    });
  }
};
