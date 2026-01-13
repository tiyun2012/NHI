
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';

export const SceneModule: EngineModule = {
  id: 'scene',

  init(ctx) {
    registerCommands(ctx, 'scene', {
      createEntity(name) {
        const id = ctx.engine.ecs.createEntity(name);
        ctx.engine.sceneGraph.registerEntity(id);
        ctx.engine.notifyUI();
        ctx.events.emit('scene:entityCreated', { id, name });
        return id;
      },

      deleteEntity(id) {
        ctx.engine.deleteEntity(id, ctx.engine.sceneGraph);
        ctx.events.emit('scene:entityDeleted', { id });
      },

      renameEntity(id, name) {
        const idx = ctx.engine.ecs.idToIndex.get(id);
        if (idx !== undefined) {
           ctx.engine.pushUndoState();
           ctx.engine.ecs.store.names[idx] = name;
           ctx.engine.notifyUI();
           ctx.events.emit('scene:entityRenamed', { id, name });
        }
      },

      reparentEntity(childId, parentId) {
         ctx.engine.pushUndoState();
         ctx.engine.sceneGraph.attach(childId, parentId);
         ctx.engine.notifyUI();
      },
    });
  },
};
