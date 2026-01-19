
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { moduleManager } from '@/engine/ModuleManager';
import { uiRegistry } from '@/editor/registries/UIRegistry';

export const UIModule: EngineModule = {
  id: 'ui',

  init(ctx) {
    registerCommands(ctx, 'ui', {
      notify() {
        ctx.engine.notifyUI();
      },
      registerSection(location, config) {
        uiRegistry.registerSection(location, config);
        ctx.events.emit('ui:registryChanged', undefined);
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
