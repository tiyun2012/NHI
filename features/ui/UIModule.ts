
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { moduleManager } from '@/engine/ModuleManager';
import { uiRegistry } from '@/editor/registries/UIRegistry';

// Internal state for widget focus
let focusedWidgetId: string | null = null;

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
      },
      registerWindow(config) {
        uiRegistry.registerWindow(config);
        ctx.events.emit('ui:registryChanged', undefined);
        ctx.engine.notifyUI();
      },
      setFocusedWidget(id: string | null) {
        if (focusedWidgetId !== id) {
            focusedWidgetId = id;
            ctx.events.emit('ui:focusedWidgetChanged', { id });
            // Emit legacy event for compatibility if needed (though TypedEventBus handles strings too)
            ctx.events.emit('WIDGET_FOCUSED', id);
        }
      }
    });

    registerQueries(ctx, 'registry', {
      getModules() {
        return moduleManager.getAllModules();
      }
    });

    registerQueries(ctx, 'ui', {
        getFocusedWidget() {
            return focusedWidgetId;
        }
    });
  }
};
