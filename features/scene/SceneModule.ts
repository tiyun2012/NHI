import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
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
      },
    });

    // Queries that keep React decoupled from ECS internals.
    registerQueries(ctx, 'scene', {
      getEntities() {
        return ctx.engine.ecs.getAllProxies(ctx.engine.sceneGraph);
      },

      getEntityName(id) {
        const idx = ctx.engine.ecs.idToIndex.get(id);
        if (idx === undefined) return null;
        return ctx.engine.ecs.store.names[idx] ?? null;
      },

      getEntityCount() {
        // Fast count using ECS store; avoids allocating proxies.
        let count = 0;
        for (let i = 0; i < ctx.engine.ecs.count; i++) {
          if (ctx.engine.ecs.store.isActive[i]) count++;
        }
        return count;
      },
    });
  },
};
