
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { SkeletonOptions } from '@/types';
import { SkeletonDisplayOptions } from '@/editor/toolOptions/SkeletonDisplayOptions';

export const SkeletonModule: EngineModule = {
  id: 'skeleton',

  init(ctx) {
    registerCommands(ctx, 'skeleton', {
      setOptions(options: Partial<SkeletonOptions>) {
        ctx.engine.skeletonTool.setOptions(options);
        ctx.engine.notifyUI();
      }
    });

    registerQueries(ctx, 'skeleton', {
      getOptions() {
        return ctx.engine.skeletonTool.getOptions();
      }
    });

    // Register Bone Display widget to shared UI locations via API
    // This allows the widget instance to be shared across ToolOptions and Inspector
    ctx.commands.ui?.registerSection?.('GLOBAL', {
        id: 'skeleton_display',
        title: 'Skeleton Display',
        icon: 'Bone',
        component: SkeletonDisplayOptions,
        order: 100
    });
  },
};
