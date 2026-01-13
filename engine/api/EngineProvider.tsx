
import React, { createContext, useContext, useMemo, useEffect } from 'react';
import type { EngineAPI } from './types'; // Import from types
import { createEngineAPI } from './createEngineAPI';
import { createEngineContext } from '@/engine/core/createEngineContext';
import { engineInstance, Engine } from '@/engine/engine';
import { SelectionModule } from '@/features/selection/SelectionModule';
import { CoreFeatureModule } from '@/features/core/CoreFeatureModule';

const EngineAPIContext = createContext<EngineAPI | null>(null);

export const EngineProvider: React.FC<React.PropsWithChildren<{ engine?: Engine }>> = ({ children, engine }) => {
  const inst = engine ?? engineInstance;
  
  // Create context and API once
  const ctx = useMemo(() => createEngineContext(inst), [inst]);
  
  // Initialize Feature Modules
  // In a real app this might be dynamic, but here we hardcode the core set.
  useMemo(() => {
      CoreFeatureModule.init(ctx);
      SelectionModule.init(ctx);
  }, [ctx]);

  const api = useMemo(() => createEngineAPI(ctx), [ctx]);

  return <EngineAPIContext.Provider value={api}>{children}</EngineAPIContext.Provider>;
};

export function useEngineAPI(): EngineAPI {
  const ctx = useContext(EngineAPIContext);
  if (!ctx) throw new Error('useEngineAPI must be used within <EngineProvider>');
  return ctx;
}
