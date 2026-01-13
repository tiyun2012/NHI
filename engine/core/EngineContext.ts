
import type { Engine } from '@/engine/engine';
import { eventBus } from '@/engine/EventBus';
import { assetManager } from '@/engine/AssetManager';
import type { EngineCommands, EngineQueries } from '@/engine/api/types';

export type EngineContext = {
  engine: Engine;
  assets: typeof assetManager;
  events: typeof eventBus;
  /** Feature command registry. */
  commands: Partial<EngineCommands>;
  /** Feature query registry. */
  queries: Partial<EngineQueries>;
};
