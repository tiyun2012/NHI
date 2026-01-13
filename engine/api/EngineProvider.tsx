import React, { createContext, useContext, useMemo } from 'react';
import type { EngineAPI } from './EngineAPI';
import { createEngineAPI } from './createEngineAPI';
import { createEngineContext } from '@/engine/core/createEngineContext';
import { engineInstance, Engine } from '@/engine/engine';

const EngineAPIContext = createContext<EngineAPI | null>(null);

export const EngineProvider: React.FC<React.PropsWithChildren<{ engine?: Engine }>> = ({ children, engine }) => {
  const inst = engine ?? engineInstance;
  const ctx = useMemo(() => createEngineContext(inst), [inst]);
  const api = useMemo(() => createEngineAPI(ctx), [ctx]);
  return <EngineAPIContext.Provider value={api}>{children}</EngineAPIContext.Provider>;
};

export function useEngineAPI(): EngineAPI {
  const ctx = useContext(EngineAPIContext);
  if (!ctx) throw new Error('useEngineAPI must be used within <EngineProvider>');
  return ctx;
}
