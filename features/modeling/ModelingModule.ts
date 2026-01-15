
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';

export const ModelingModule: EngineModule = {
  id: 'modeling',

  init(ctx) {
    registerCommands(ctx, 'modeling', {
      extrudeFaces() {
        ctx.engine.extrudeFaces();
      },
      bevelEdges() {
        ctx.engine.bevelEdges();
      },
      weldVertices() {
        ctx.engine.weldVertices();
      },
      connectComponents() {
        ctx.engine.connectComponents();
      },
      deleteSelectedFaces() {
        ctx.engine.deleteSelectedFaces();
      }
    });
  }
};
