import type { Engine } from '@/engine/engine';
import type { EngineAPI } from './types';
import type { EngineContext } from '@/engine/core/EngineContext';
import { createEngineContext } from '@/engine/core/createEngineContext';
import { initModules } from '@/engine/core/moduleHost';
import { MODULES } from '@/engine/modules';
// NOTE: Avoid relative imports here.
// In some hosting environments (e.g. blob/data module URLs), browsers cannot
// resolve relative module specifiers ("./...") because the base URL scheme is
// not hierarchical. Using the project alias keeps this module robust.
import { createEngineAPI } from '@/engine/api/createEngineAPI';

/**
 * A per-Engine cached runtime for the feature-module + API layer.
 *
 * Why:
 * - Keeps a stable EngineContext (events bus, registries) across React remounts / HMR.
 * - Prevents double-initializing modules.
 * - Lets the Engine own long-lived feature modules (disposed on engine.dispose()).
 */

type EngineRuntime = {
  ctx: EngineContext;
  api: EngineAPI;
  disposeModules: () => void;
  refCount: number;
};

const RUNTIME_KEY = '__ti3d_engineRuntime__';
const DISPOSE_KEY = '__ti3d_disposeEngineRuntime__';

function getRuntime(engine: Engine): EngineRuntime | undefined {
  return (engine as any)[RUNTIME_KEY] as EngineRuntime | undefined;
}

function setRuntime(engine: Engine, runtime: EngineRuntime) {
  Object.defineProperty(engine as any, RUNTIME_KEY, {
    value: runtime,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  // Attach a disposal hook that Engine.dispose() can call without importing feature modules.
  Object.defineProperty(engine as any, DISPOSE_KEY, {
    value: () => {
      const rt = getRuntime(engine);
      if (!rt) return;
      try {
        rt.disposeModules();
      } finally {
        try {
          delete (engine as any)[RUNTIME_KEY];
          delete (engine as any)[DISPOSE_KEY];
        } catch {
          // ignore
        }
      }
    },
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

/**
 * Acquire a stable EngineAPI for a given engine.
 *
 * - Initializes the feature modules once.
 * - Returns the same API instance for the same engine.
 */
export function acquireEngineAPI(engine: Engine): EngineAPI {
  let rt = getRuntime(engine);
  if (!rt) {
    const ctx = createEngineContext(engine);
    const disposeModules = initModules(ctx, MODULES);
    const api = createEngineAPI(ctx);
    rt = { ctx, api, disposeModules, refCount: 0 };
    setRuntime(engine, rt);
  }

  rt.refCount++;
  return rt.api;
}

/**
 * Release an EngineAPI acquired from acquireEngineAPI.
 *
 * NOTE: For long-lived editor engines (singleton), we keep modules alive even when refCount hits 0.
 * The engine should call its own dispose() when truly shutting down.
 */
export function releaseEngineAPI(engine: Engine) {
  const rt = getRuntime(engine);
  if (!rt) return;
  rt.refCount = Math.max(0, rt.refCount - 1);
}

/**
 * If present, dispose the feature-module runtime attached to the engine.
 */
export function disposeEngineRuntime(engine: Engine) {
  const dispose = (engine as any)[DISPOSE_KEY] as undefined | (() => void);
  dispose?.();
}
