
import React, { useEffect } from 'react';
import { engineInstance } from '@/engine/engine';
import { registerCoreModules } from '@/engine/modules/CoreModules';
import { toolRegistry } from '@/editor/registries/ToolRegistry';
import { TransformToolOptions } from '@/editor/toolOptions/TransformToolOptions';
import { SelectToolInfo } from '@/editor/toolOptions/SelectToolInfo';
import { useEngineAPI } from '@/engine/api/EngineProvider';

// IMPORTANT:
// React StrictMode in development intentionally mounts/unmounts/remounts components.
// Keep boot-time registration out of render and ensure it only runs once per page-load.
let didBootInit = false;

export const EditorBoot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = useEngineAPI();

  // One-time module/tool registration (safe across StrictMode remounts)
  useEffect(() => {
    if (didBootInit) return;

    registerCoreModules(
      engineInstance.physicsSystem,
      engineInstance.particleSystem,
      engineInstance.animationSystem
    );

    // Register Tool UIs
    toolRegistry.register('SELECT', SelectToolInfo);
    toolRegistry.register('MOVE', TransformToolOptions);
    toolRegistry.register('ROTATE', TransformToolOptions);
    toolRegistry.register('SCALE', TransformToolOptions);

    didBootInit = true;
  }, []);

  // EXPOSE GLOBALS FOR CONSOLE CHEATS/DEBUGGING (DEV ONLY)
  useEffect(() => {
    // Defensive check for Vite env globals
    const isDev = (import.meta as any).env?.DEV ?? true;
    if (!isDev) return;

    (window as any).ti3d = { engine: engineInstance, api };
    // eslint-disable-next-line no-console
    console.log('Global access enabled (dev): window.ti3d.engine, window.ti3d.api');

    return () => {
      try {
        delete (window as any).ti3d;
      } catch {
        /* ignore */
      }
    };
  }, [api]);

  return <>{children}</>;
};
