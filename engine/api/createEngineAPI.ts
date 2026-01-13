
import type { EngineAPI, EngineEvents } from './types';
import type { EngineContext } from '@/engine/core/EngineContext';

export function createEngineAPI(ctx: EngineContext): EngineAPI {
  return {
    commands: new Proxy({} as any, {
      get: (_, prop) => {
        const key = prop as keyof typeof ctx.commands;
        if (ctx.commands[key]) return ctx.commands[key];
        console.warn(`Command namespace '${String(key)}' not registered.`);
        return {};
      }
    }),
    queries: new Proxy({} as any, {
      get: (_, prop) => {
        const key = prop as keyof typeof ctx.queries;
        if (ctx.queries[key]) return ctx.queries[key];
        console.warn(`Query namespace '${String(key)}' not registered.`);
        return {};
      }
    }),
    subscribe: <E extends keyof EngineEvents>(event: E, cb: (payload: EngineEvents[E]) => void) => {
      const typeSafeCb = cb as (payload: any) => void;
      ctx.events.on(event as string, typeSafeCb);
      return () => ctx.events.off(event as string, typeSafeCb);
    },
  };
}
