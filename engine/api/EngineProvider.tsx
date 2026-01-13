
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { EngineAPI } from './types';
import { createEngineAPI } from './createEngineAPI';
import { createEngineContext } from '@/engine/core/createEngineContext';
import { initModules } from '@/engine/core/moduleHost';
import { MODULES } from '@/engine/modules';
import { engineInstance, Engine } from '@/engine/engine';

const EngineAPIContext = createContext<EngineAPI | null>(null);

export const EngineProvider: React.FC<React.PropsWithChildren<{ engine?: Engine }>> = ({ children, engine }) => {
  const inst = engine ?? engineInstance;
  
  const ctx = useMemo(() => createEngineContext(inst), [inst]);
  const api = useMemo(() => createEngineAPI(ctx), [ctx]);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    
    // Initialize all registered modules
    const dispose = initModules(ctx, MODULES);
    
    return () => {
        dispose();
        didInit.current = false;
    };
  }, [ctx]);

  return <EngineAPIContext.Provider value={api}>{children}</EngineAPIContext.Provider>;
};

export function useEngineAPI(): EngineAPI {
  const ctx = useContext(EngineAPIContext);
  if (!ctx) throw new Error('useEngineAPI must be used within <EngineProvider>');
  return ctx;
}
