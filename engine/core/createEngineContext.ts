import type { EngineContext } from './EngineContext';
import type { Engine } from '@/engine/engine';
import { eventBus } from '@/engine/EventBus';
import { assetManager } from '@/engine/AssetManager';

/**
 * Bridge context used by new feature modules.
 * Keep this context small and dependency-injected so the engine can be instantiated
 * multiple times (tests, previews, multi-scene) without relying on a global singleton.
 */
export function createEngineContext(engine: Engine): EngineContext {
  return {
    engine,
    assets: assetManager,
    events: eventBus,
    commands: {},
  };
}
