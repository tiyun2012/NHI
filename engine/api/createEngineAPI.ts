
import type { EngineAPI, EngineCommands, EngineQueries, EngineEvents } from './types';
import type { EngineContext } from '@/engine/core/EngineContext';

function createRegistryProxy<T extends object>(label: string, src: () => any): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const val = src()?.[prop];
        if (!val) {
          throw new Error(`[engine] Missing ${label}.${prop} (module not registered?)`);
        }
        return val;
      },
    }
  ) as T;
}

export function createEngineAPI(ctx: EngineContext): EngineAPI {
  const commands = createRegistryProxy<EngineCommands>('commands', () => ctx.commands);
  const queries = createRegistryProxy<EngineQueries>('queries', () => ctx.queries);

  return {
    commands,
    queries,
    subscribe: <E extends keyof EngineEvents>(event: E | string, cb: (payload: any) => void) => {
      ctx.events.on(event as string, cb);
      return () => ctx.events.off(event as string, cb);
    },
  };
}
