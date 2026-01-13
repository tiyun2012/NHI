
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { EngineAPI } from './types';
import { createEngineAPI } from './createEngineAPI';
import { createEngineContext } from '@/engine/core/createEngineContext';
import { initModules } from '@/engine/core/moduleHost';
import { MODULES } from '@/engine/modules';
import { engineInstance, Engine } from '@/engine/engine';

const EngineAPIContext = createContext<EngineAPI | null>(null);

export const EngineProvider: React.FC<React.PropsWithChildren<{ engine?: Engine }>> = ({ children, engine }) => {
  const inst = engine ?? engineInstance;
  
  // Initialize context and modules synchronously so they are ready
  // before children render or run their effects.
  const value = useMemo(() => {
    const ctx = createEngineContext(inst);
    // Initialize modules immediately to populate commands/queries
    const disposeModules = initModules(ctx, MODULES);
    const api = createEngineAPI(ctx);
    
    return { api, disposeModules };
  }, [inst]);

  // Cleanup modules on unmount
  useEffect(() => {
    return () => {
      value.disposeModules();
    };
  }, [value]);

  return <EngineAPIContext.Provider value={value.api}>{children}</EngineAPIContext.Provider>;
};

export function useEngineAPI(): EngineAPI {
  const ctx = useContext(EngineAPIContext);
  if (!ctx) throw new Error('useEngineAPI must be used within <EngineProvider>');
  return ctx;
}
