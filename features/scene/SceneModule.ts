
import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands } from '@/engine/core/registry';
import { ComponentType } from '@/types';

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

      duplicateEntity(id) {
        ctx.engine.duplicateEntity(id);
        // Duplicate internally triggers notifyUI
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

      addComponent(id, type) {
        ctx.engine.pushUndoState();
        ctx.engine.ecs.addComponent(id, type as ComponentType);
        ctx.engine.notifyUI();
        ctx.events.emit('component:added', { id, type: type as ComponentType });
      },

      removeComponent(id, type) {
        ctx.engine.pushUndoState();
        ctx.engine.ecs.removeComponent(id, type as ComponentType);
        ctx.engine.notifyUI();
        ctx.events.emit('component:removed', { id, type: type as ComponentType });
      },

      createEntityFromAsset(assetId, pos) {
        const id = ctx.engine.createEntityFromAsset(assetId, pos);
        if (id) {
            ctx.events.emit('scene:entityCreated', { id });
        }
        return id;
      },

      loadSceneFromAsset(assetId) {
        ctx.engine.loadSceneFromAsset(assetId);
        // loadSceneFromAsset internally handles notification and selection clearing
      }
    });
  },
};
