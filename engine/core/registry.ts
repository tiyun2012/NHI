
import type { EngineCommands, EngineQueries } from '@/engine/api/types';
import type { EngineContext } from './EngineContext';

export function registerCommands<K extends keyof EngineCommands>(
  ctx: EngineContext,
  key: K,
  impl: EngineCommands[K]
) {
  if (ctx.commands[key]) {
    console.warn(`[engine] commands.${String(key)} already registered (overwriting)`);
  }
  ctx.commands[key] = impl;
}

export function registerQueries<K extends keyof EngineQueries>(
  ctx: EngineContext,
  key: K,
  impl: EngineQueries[K]
) {
  if (ctx.queries[key]) {
    console.warn(`[engine] queries.${String(key)} already registered (overwriting)`);
  }
  ctx.queries[key] = impl;
}
