
import type { EngineContext } from './EngineContext';
import type { Engine } from '@/engine/engine';
import { eventBus } from '@/engine/EventBus';
import { assetManager } from '@/engine/AssetManager';

export function createEngineContext(engine: Engine): EngineContext {
  return {
    engine,
    assets: assetManager,
    events: eventBus,
    commands: {},
    queries: {},
  };
}
