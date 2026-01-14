
import type { EngineAPI, EngineCommands, EngineQueries, EngineEvents } from './types';
import type { EngineContext } from '@/engine/core/EngineContext';

function createMissingProxy(path: string) {
  const fn = () => {
    throw new Error(`[engine] Missing ${path} (module not registered?)`);
  };

  return new Proxy(fn as any, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      return createMissingProxy(`${path}.${prop}`);
    },
    apply() {
      throw new Error(`[engine] Missing ${path} (module not registered?)`);
    },
  });
}

function createRegistryProxy<T extends object>(label: string, src: () => any): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const val = src()?.[prop];
        if (!val) return createMissingProxy(`${label}.${prop}`);
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
    subscribe(event: any, cb: any) {
      ctx.events.on(event as string, cb);
      return () => ctx.events.off(event as string, cb);
    },
  };
}
