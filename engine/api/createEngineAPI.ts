
import type { EngineAPI, EngineCommands, EngineQueries, EngineEvents } from './types';
import type { EngineContext } from '@/engine/core/EngineContext';
import { consoleService } from '@/engine/Console';

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

function createRegistryProxy<T extends object>(label: string, src: () => any, logCalls: boolean = false): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const val = src()?.[prop];
        if (!val) return createMissingProxy(`${label}.${prop}`);

        // Inject logger for commands to facilitate debugging and scripting
        if (logCalls && typeof val === 'object' && val !== null) {
            return new Proxy(val, {
                get(target, method) {
                    const fn = target[method as keyof typeof target];
                    if (typeof fn === 'function') {
                        return (...args: any[]) => {
                            // Serialize arguments for logging
                            let argsStr = '';
                            try {
                                argsStr = args.map(a => JSON.stringify(a)).join(', ');
                            } catch (e) {
                                argsStr = '...';
                            }

                            const cmdStr = `api.commands.${String(prop)}.${String(method)}(${argsStr})`;

                            // 1. Browser Console (Executable Style)
                            console.log(`%c${cmdStr}`, 'color: #00bcd4; font-family: monospace; font-weight: bold;');
                            
                            // 2. In-App Console (History)
                            consoleService.cmd(cmdStr);

                            return (fn as Function).apply(target, args);
                        };
                    }
                    return fn;
                }
            });
        }

        return val;
      },
    }
  ) as T;
}


export function createEngineAPI(ctx: EngineContext): EngineAPI {
  // Enable logging for commands (true) but not queries (false)
  const commands = createRegistryProxy<EngineCommands>('commands', () => ctx.commands, true);
  const queries = createRegistryProxy<EngineQueries>('queries', () => ctx.queries, false);

  return {
    commands,
    queries,
    subscribe(event: any, cb: any) {
      ctx.events.on(event as string, cb);
      return () => ctx.events.off(event as string, cb);
    },
  };
}
