
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { EngineAPI } from './types';
import { engineInstance, Engine } from '@/engine/engine';
// NOTE: Avoid relative imports to make this module robust in environments
// where code is evaluated via blob/data URLs.
import { acquireEngineAPI, releaseEngineAPI, disposeEngineRuntime } from '@/engine/api/engineRuntime';

const EngineAPIContext = createContext<EngineAPI | null>(null);

/**
 * React <-> Engine bridge.
 *
 * Long-term behavior:
 * - The feature-module + API layer is initialized ONCE per Engine instance.
 * - The EngineContext (events/registries) stays stable across React remounts / HMR.
 */
export const EngineProvider: React.FC<React.PropsWithChildren<{ engine?: Engine; api?: EngineAPI }>> = ({ children, engine, api: providedApi }) => {
  const inst = engine ?? engineInstance;

  // Acquire a stable API for this engine instance.
  // If 'api' prop is provided, use it directly (e.g. for AssetViewportEngine adapters).
  const api = useMemo(() => {
      if (providedApi) return providedApi;
      return acquireEngineAPI(inst);
  }, [inst, providedApi]);

  // Release the reference on unmount.
  // If the engine is explicitly provided, treat it as owned and dispose its runtime.
  useEffect(() => {
    if (providedApi) return; 

    return () => {
      releaseEngineAPI(inst);
      if (engine) {
        disposeEngineRuntime(inst);
      }
    };
  }, [inst, engine, providedApi]);

  return <EngineAPIContext.Provider value={api}>{children}</EngineAPIContext.Provider>;
};

export function useEngineAPI(): EngineAPI {
  const ctx = useContext(EngineAPIContext);
  if (!ctx) throw new Error('useEngineAPI must be used within <EngineProvider>');
  return ctx;
}
