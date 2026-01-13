
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';

export const SculptModule: EngineModule = {
  id: 'sculpt',

  init(ctx) {
    registerCommands(ctx, 'sculpt', {
      setEnabled(enabled) {
        ctx.engine.deformationSystem.enabled = enabled;
        ctx.engine.deformationSystem.recalculateSoftSelection(true, ctx.engine.meshComponentMode);
        ctx.engine.notifyUI();
      },
      setRadius(radius) {
        ctx.engine.deformationSystem.radius = radius;
        ctx.engine.deformationSystem.recalculateSoftSelection(true, ctx.engine.meshComponentMode);
        ctx.engine.notifyUI();
      },
      setMode(mode) {
        ctx.engine.deformationSystem.mode = mode;
        ctx.engine.deformationSystem.recalculateSoftSelection(true, ctx.engine.meshComponentMode);
        ctx.engine.notifyUI();
      },
      setFalloff(falloff) {
        ctx.engine.deformationSystem.falloff = falloff;
        ctx.engine.deformationSystem.recalculateSoftSelection(true, ctx.engine.meshComponentMode);
        ctx.engine.notifyUI();
      },
      setHeatmapVisible(visible) {
        ctx.engine.deformationSystem.heatmapVisible = visible;
        ctx.engine.notifyUI();
      }
    });
  }
};
