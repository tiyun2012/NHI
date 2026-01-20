import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { COMPONENT_MASKS } from '@/engine/constants';
import { StaticMeshAsset } from '@/types';

export const CoreModule: EngineModule = {
  id: 'core-essentials',

  init(ctx) {
    registerCommands(ctx, 'simulation', {
      setMode(mode) {
        if (mode === 'STOPPED') ctx.engine.stop();
        else ctx.engine.start(mode);
        ctx.events.emit('simulation:modeChanged', { mode });
      },
    });

    registerQueries(ctx, 'simulation', {
      getMode() {
        return ctx.engine.simulationMode;
      },
      isPlaying() {
        return ctx.engine.isPlaying;
      },
      getMetrics() {
        return ctx.engine.metrics;
      },
    });

    registerCommands(ctx, 'mesh', {
      setComponentMode(mode) {
        ctx.engine.meshComponentMode = mode;
        ctx.engine.notifyUI();
      },
      updateAssetGeometry(assetId, geometry) {
        const asset = ctx.assets.getAsset(assetId);
        if (asset && (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH')) {
          const meshAsset = asset as StaticMeshAsset;
          // Apply patches
          if (geometry.vertices) meshAsset.geometry.vertices = geometry.vertices;
          if (geometry.normals) meshAsset.geometry.normals = geometry.normals;
          if (geometry.uvs) meshAsset.geometry.uvs = geometry.uvs;
          if (geometry.indices) meshAsset.geometry.indices = geometry.indices;

          // Sync with engine's GPU resources
          ctx.engine.registerAssetWithGPU(meshAsset);
          ctx.engine.notifyUI();
          ctx.engine.tick(0); // Force immediate frame update for UI responsiveness
        }
      },
    });

    registerQueries(ctx, 'mesh', {
      getAssetByEntity(entityId) {
        const idx = ctx.engine.ecs.idToIndex.get(entityId);
        if (idx === undefined) return null;

        if (ctx.engine.ecs.store.componentMask[idx] & COMPONENT_MASKS.MESH) {
          const meshIntId = ctx.engine.ecs.store.meshType[idx];
          const uuid = ctx.assets.meshIntToUuid.get(meshIntId);
          return uuid ? ctx.assets.getAsset(uuid) : null;
        }
        return null;
      },
    });
  },
};
