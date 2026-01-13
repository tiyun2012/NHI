
import type { EngineModule } from "@/engine/core/EngineModule";
import type { EngineContext } from "@/engine/core/EngineContext";
import { ComponentType } from "@/types";

export const CoreFeatureModule: EngineModule = {
  id: "core-features",
  init(ctx: EngineContext) {
    // Simulation
    ctx.commands.simulation = {
      setMode(mode) {
        ctx.engine.start(mode);
      }
    };

    // Mesh
    ctx.commands.mesh = {
      setComponentMode(mode) {
        ctx.engine.meshComponentMode = mode;
        ctx.engine.notifyUI();
      }
    };

    // Scene
    ctx.commands.scene = {
      createEntity(name) {
        const id = ctx.engine.ecs.createEntity(name);
        ctx.engine.sceneGraph.registerEntity(id);
        ctx.engine.notifyUI();
        ctx.events.emit('scene:entityCreated', { id });
        return id;
      },
      deleteEntity(id) {
        ctx.engine.deleteEntity(id, ctx.engine.sceneGraph);
        ctx.events.emit('scene:entityDestroyed', { id });
      },
      renameEntity(id, name) {
        const idx = ctx.engine.ecs.idToIndex.get(id);
        if (idx !== undefined) {
           ctx.engine.pushUndoState();
           ctx.engine.ecs.store.names[idx] = name;
           ctx.engine.notifyUI();
        }
      },
      reparentEntity(childId, parentId) {
         ctx.engine.pushUndoState();
         ctx.engine.sceneGraph.attach(childId, parentId);
         ctx.engine.notifyUI();
      }
    };
  }
};
