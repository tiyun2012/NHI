
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';

export const CoreModule: EngineModule = {
  id: 'core-essentials',

  init(ctx) {
    registerCommands(ctx, 'simulation', {
      setMode(mode) {
        ctx.engine.start(mode);
        ctx.events.emit('simulation:modeChanged', { mode });
      }
    });

    registerCommands(ctx, 'mesh', {
      setComponentMode(mode) {
        ctx.engine.meshComponentMode = mode;
        ctx.engine.notifyUI();
      }
    });
  }
};
