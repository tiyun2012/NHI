
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';
import { SkeletonOptions } from '@/types';

export const SkeletonModule: EngineModule = {
  id: 'skeleton',

  init(ctx) {
    registerCommands(ctx, 'skeleton', {
      setOptions(options: Partial<SkeletonOptions>) {
        ctx.engine.skeletonTool.setOptions(options);
        ctx.engine.notifyUI();
      }
    });
  },
};
