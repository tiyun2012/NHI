
import { useMemo, useState } from 'react';
import { MeshComponentMode, SoftSelectionFalloff, ToolType, UIConfiguration } from '@/types';
import type { SoftSelectionMode } from '@/engine/engine';
import { DEFAULT_UI_CONFIG } from '@/editor/state/EditorContext';

export interface AssetViewportState {
  tool: ToolType;
  setTool: (tool: ToolType) => void;

  meshComponentMode: MeshComponentMode;
  setMeshComponentMode: (mode: MeshComponentMode) => void;

  // Soft Selection
  softSelectionEnabled: boolean;
  setSoftSelectionEnabled: (enabled: boolean) => void;
  softSelectionRadius: number;
  setSoftSelectionRadius: (radius: number) => void;
  softSelectionMode: SoftSelectionMode;
  setSoftSelectionMode: (mode: SoftSelectionMode) => void;
  softSelectionFalloff: SoftSelectionFalloff;
  setSoftSelectionFalloff: (falloff: SoftSelectionFalloff) => void;
  softSelectionHeatmapVisible: boolean;
  setSoftSelectionHeatmapVisible: (visible: boolean) => void;

  // Viewport overlay UI
  uiConfig: UIConfiguration;
  setUiConfig: (cfg: UIConfiguration) => void;
}

export type AssetViewportStateInit = Partial<Omit<AssetViewportState, 'setTool' | 'setMeshComponentMode' | 'setSoftSelectionEnabled' | 'setSoftSelectionRadius' | 'setSoftSelectionMode' | 'setSoftSelectionFalloff' | 'setSoftSelectionHeatmapVisible' | 'setUiConfig'>>;

export function useAssetViewportState(init: AssetViewportStateInit = {}): AssetViewportState {
  const [tool, setTool] = useState<ToolType>(init.tool ?? 'SELECT');
  const [meshComponentMode, setMeshComponentMode] = useState<MeshComponentMode>(init.meshComponentMode ?? 'OBJECT');

  const [softSelectionEnabled, setSoftSelectionEnabled] = useState<boolean>(init.softSelectionEnabled ?? false);
  const [softSelectionRadius, setSoftSelectionRadius] = useState<number>(init.softSelectionRadius ?? 1.0);
  const [softSelectionMode, setSoftSelectionMode] = useState<SoftSelectionMode>(init.softSelectionMode ?? 'FIXED');
  const [softSelectionFalloff, setSoftSelectionFalloff] = useState<SoftSelectionFalloff>(init.softSelectionFalloff ?? 'VOLUME');
  const [softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible] = useState<boolean>(init.softSelectionHeatmapVisible ?? false);

  const [uiConfig, setUiConfig] = useState<UIConfiguration>(init.uiConfig ?? DEFAULT_UI_CONFIG);

  return useMemo(
    () => ({
      tool,
      setTool,
      meshComponentMode,
      setMeshComponentMode,
      softSelectionEnabled,
      setSoftSelectionEnabled,
      softSelectionRadius,
      setSoftSelectionRadius,
      softSelectionMode,
      setSoftSelectionMode,
      softSelectionFalloff,
      setSoftSelectionFalloff,
      softSelectionHeatmapVisible,
      setSoftSelectionHeatmapVisible,
      uiConfig,
      setUiConfig,
    }),
    [
      tool,
      meshComponentMode,
      softSelectionEnabled,
      softSelectionRadius,
      softSelectionMode,
      softSelectionFalloff,
      softSelectionHeatmapVisible,
      uiConfig,
    ]
  );
}
