
import type { Engine } from '@/engine/engine';
import type { EngineCommands, EngineEvents, EngineQueries } from '@/engine/api/types';
import type { TypedEventBus } from './eventBus';
import { assetManager } from '@/engine/AssetManager';

export type EngineContext = {
  engine: Engine;
  // Deprecated global bus reference, keeping for backward compat if needed during migration
  // but preferably modules use ctx.events
  assets: typeof assetManager; 
  
  events: TypedEventBus<EngineEvents>;

  // registry
  commands: Partial<EngineCommands>;
  queries: Partial<EngineQueries>;
};
