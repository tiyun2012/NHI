
import type { EngineContext } from './EngineContext';
import type { Engine } from '@/engine/engine';
import { TypedEventBus } from './eventBus';
import { assetManager } from '@/engine/AssetManager';

export function createEngineContext(engine: Engine): EngineContext {
  return {
    engine,
    assets: assetManager,
    events: new TypedEventBus(),
    commands: {},
    queries: {},
  };
}
