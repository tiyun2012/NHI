import type { Engine } from '@/engine/engine';
import { eventBus } from '@/engine/EventBus';
import { assetManager } from '@/engine/AssetManager';

export type EngineContext = {
  engine: Engine;
  assets: typeof assetManager;
  events: typeof eventBus;
  /** Feature command registry (populated by modules). */
  commands: Record<string, any>;
};
