
import type { EngineContext } from './EngineContext';

export interface EngineModule {
  id: string;
  init(ctx: EngineContext): void;
  dispose?(ctx: EngineContext): void;
}

export function initModules(ctx: EngineContext, modules: readonly EngineModule[]) {
  const inited: EngineModule[] = [];

  for (const m of modules) {
    m.init(ctx);
    inited.push(m);
  }

  return () => {
    // dispose in reverse order
    for (let i = inited.length - 1; i >= 0; i--) {
      inited[i].dispose?.(ctx);
    }
  };
}
