
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

/**
 * Safely format arguments for the log to prevent crashes on circular structures
 * or large objects (like React components).
 */
function safeFormatArgs(args: any[]): string {
    return args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        const type = typeof arg;
        if (type === 'string') return `"${arg}"`;
        if (type === 'number' || type === 'boolean') return String(arg);
        if (type === 'function') return `fn ${arg.name || ''}`;
        
        // For objects, try a shallow summary or type name
        if (Array.isArray(arg)) return `Array(${arg.length})`;
        
        // Catch common React or complex types
        if (arg.$$typeof || arg._owner || arg.type) return `[Component]`;
        
        try {
            // Simple shallow summary of object keys
            const keys = Object.keys(arg);
            if (keys.length > 5) return `{ ${keys.slice(0, 5).join(', ')}... }`;
            return JSON.stringify(arg);
        } catch (e) {
            return `[Object]`;
        }
    }).join(', ');
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
                            const argsDisplay = safeFormatArgs(args);
                            const cmdStr = `api.commands.${String(prop)}.${String(method)}(${argsDisplay})`;

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
