
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Entity, ToolType, TransformSpace, SelectionType, GraphNode, GraphConnection, MeshComponentMode, SimulationMode, SoftSelectionFalloff } from '@/types';
import { EditorContext, EditorContextType, DEFAULT_UI_CONFIG, UIConfiguration, GridConfiguration, DEFAULT_GRID_CONFIG, SnapSettings, DEFAULT_SNAP_CONFIG, DEFAULT_SKELETON_VIZ, SkeletonVizSettings } from '@/editor/state/EditorContext';
import { engineInstance, SoftSelectionMode } from '@/engine/engine';
import { useEngineAPI } from '@/engine/api/EngineProvider';

export const EditorStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const api = useEngineAPI();
    
    // Engine State Mirrors
    const [entities, setEntities] = useState<Entity[]>([]);
    const [simulationMode, setSimulationMode] = useState<SimulationMode>('STOPPED');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    // Editor UI State
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [selectionType, setSelectionType] = useState<SelectionType>('ENTITY');
    const [tool, setTool] = useState<ToolType>('SELECT');
    const [transformSpace, setTransformSpace] = useState<TransformSpace>('World');
    const [meshComponentMode, setMeshComponentMode] = useState<MeshComponentMode>('OBJECT');
    
    // Initialized in effect to avoid Proxy access during constructor phase
    const [focusedWidgetId, setFocusedWidgetIdLocal] = useState<string | null>(null);
    
    // Per-object mode memory: Map<EntityID, Mode>
    const [perObjectModes] = useState(() => new Map<string, MeshComponentMode>());

    // Soft Selection State
    const [softSelectionEnabled, setSoftSelectionEnabled] = useState(false);
    const [softSelectionRadius, setSoftSelectionRadius] = useState(2.0);
    const [softSelectionMode, setSoftSelectionMode] = useState<SoftSelectionMode>('FIXED');
    const [softSelectionFalloff, setSoftSelectionFalloff] = useState<SoftSelectionFalloff>('VOLUME');
    const [softSelectionHeatmapVisible, setSoftSelectionHeatmapVisible] = useState(true);

    // Graph State
    const [inspectedNode, setInspectedNode] = useState<GraphNode | null>(null);
    const [activeGraphConnections, setActiveGraphConnections] = useState<GraphConnection[]>([]);
    
    // Configuration
    const [uiConfig, setUiConfig] = useState<UIConfiguration>(DEFAULT_UI_CONFIG);
    const [gridConfig, setGridConfig] = useState<GridConfiguration>(DEFAULT_GRID_CONFIG);
    const [snapSettings, setSnapSettings] = useState<SnapSettings>(DEFAULT_SNAP_CONFIG);
    const [skeletonViz, setSkeletonViz] = useState<SkeletonVizSettings>(DEFAULT_SKELETON_VIZ);

    const onNodeDataChangeRef = useRef<((nodeId: string, key: string, value: any) => void) | null>(null);

    // Initialize state from API
    useEffect(() => {
        setFocusedWidgetIdLocal(api.queries.ui.getFocusedWidget());
    }, [api]);

    // --- Subscriptions ---

    // Sync Entities & Sim Mode
    useEffect(() => {
        let lastEntityCount = -1;
        const update = () => {
            const currentCount = api.queries.scene.getEntityCount();
            // Only re-map proxies if the count changed to avoid identity loop
            if (currentCount !== lastEntityCount) {
                setEntities(api.queries.scene.getEntities());
                lastEntityCount = currentCount;
            }
            
            const currentMode = api.queries.simulation.getMode();
            setSimulationMode(currentMode);
        };
        update();
        return engineInstance.subscribe(update);
    }, [api]);

    // Sync Selection
    useEffect(() => {
        return api.subscribe('selection:changed', (payload) => {
            setSelectedIds(payload.ids);
        });
    }, [api]);

    // Sync Focus
    useEffect(() => {
        return api.subscribe('ui:focusedWidgetChanged', (payload) => {
            setFocusedWidgetIdLocal(payload.id);
        });
    }, [api]);

    // Sync Configs to Engine
    useEffect(() => {
        api.commands.mesh.setComponentMode(meshComponentMode);
    }, [meshComponentMode, api]);

    useEffect(() => { engineInstance.setGridConfig(gridConfig); }, [gridConfig]);
    useEffect(() => { engineInstance.setUiConfig(uiConfig); }, [uiConfig]);

    // --- Command Wrappers ---

    const handleSetSelectedIds = useCallback((ids: string[]) => {
        api.commands.selection.setSelected(ids);
        if (ids.length > 0) setInspectedNode(null);

        // Mode Memory Logic
        if (ids.length === 1) {
            const savedMode = perObjectModes.get(ids[0]) || 'OBJECT';
            if (savedMode !== meshComponentMode) setMeshComponentMode(savedMode);
        } else {
            if (meshComponentMode !== 'OBJECT') setMeshComponentMode('OBJECT');
        }
    }, [meshComponentMode, perObjectModes, api]);

    const handleSetMeshComponentMode = useCallback((mode: MeshComponentMode) => {
        setMeshComponentMode(mode);
        if (selectedIds.length === 1) {
            perObjectModes.set(selectedIds[0], mode);
        }
    }, [selectedIds, perObjectModes]);

    const handleSetSoftSelectionEnabled = useCallback((enabled: boolean) => {
        setSoftSelectionEnabled(enabled);
        api.commands.sculpt.setEnabled(enabled);
    }, [api]);

    const handleSetSoftSelectionRadius = useCallback((radius: number) => {
        setSoftSelectionRadius(radius);
        api.commands.sculpt.setRadius(radius);
    }, [api]);

    const handleSetSoftSelectionMode = useCallback((mode: SoftSelectionMode) => {
        setSoftSelectionMode(mode);
        api.commands.sculpt.setMode(mode);
    }, [api]);

    const handleSetSoftSelectionFalloff = useCallback((falloff: SoftSelectionFalloff) => {
        setSoftSelectionFalloff(falloff);
        api.commands.sculpt.setFalloff(falloff);
    }, [api]);

    const handleSetSoftSelectionHeatmapVisible = useCallback((visible: boolean) => {
        setSoftSelectionHeatmapVisible(visible);
        api.commands.sculpt.setHeatmapVisible(visible);
    }, [api]);

    const handleSetSkeletonViz = useCallback((settings: SkeletonVizSettings) => {
        setSkeletonViz(settings);
        api.commands.skeleton.setOptions(settings);
    }, [api]);

    const handleSetFocusedWidgetId = useCallback((id: string | null) => {
        api.commands.ui.setFocusedWidget(id);
    }, [api]);

    const contextValue = useMemo<EditorContextType>(() => ({
        entities,
        sceneGraph: engineInstance.sceneGraph,
        selectedIds,
        setSelectedIds: handleSetSelectedIds,
        selectedAssetIds,
        setSelectedAssetIds,
        inspectedNode,
        setInspectedNode,
        activeGraphConnections,
        setActiveGraphConnections,
        updateInspectedNodeData: (key, value) => {
            if (inspectedNode) {
                setInspectedNode(prev => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
            }
        },
        onNodeDataChange: (nodeId, key, value) => {
            if (onNodeDataChangeRef.current) onNodeDataChangeRef.current(nodeId, key, value);
        },
        setOnNodeDataChange: (cb) => { onNodeDataChangeRef.current = cb; },
        selectionType,
        setSelectionType,
        meshComponentMode,
        setMeshComponentMode: handleSetMeshComponentMode,
        softSelectionEnabled,
        setSoftSelectionEnabled: handleSetSoftSelectionEnabled,
        softSelectionRadius,
        setSoftSelectionRadius: handleSetSoftSelectionRadius,
        softSelectionMode,
        setSoftSelectionMode: handleSetSoftSelectionMode,
        softSelectionFalloff,
        setSoftSelectionFalloff: handleSetSoftSelectionFalloff,
        softSelectionHeatmapVisible,
        setSoftSelectionHeatmapVisible: handleSetSoftSelectionHeatmapVisible,
        tool,
        setTool,
        transformSpace,
        setTransformSpace,
        isPlaying: engineInstance.isPlaying,
        simulationMode,
        uiConfig,
        setUiConfig,
        gridConfig,
        setGridConfig,
        snapSettings,
        setSnapSettings,
        skeletonViz,
        setSkeletonViz: handleSetSkeletonViz,
        focusedWidgetId,
        setFocusedWidgetId: handleSetFocusedWidgetId
    }), [
        entities, selectedIds, selectedAssetIds, inspectedNode, activeGraphConnections, 
        selectionType, meshComponentMode, tool, transformSpace, uiConfig, gridConfig, 
        snapSettings, skeletonViz, engineInstance.isPlaying, simulationMode, softSelectionEnabled, softSelectionRadius, softSelectionMode,
        softSelectionFalloff, softSelectionHeatmapVisible, focusedWidgetId, handleSetSelectedIds, handleSetMeshComponentMode,
        handleSetSoftSelectionEnabled, handleSetSoftSelectionRadius, handleSetSoftSelectionMode, handleSetSoftSelectionFalloff, handleSetSoftSelectionHeatmapVisible,
        handleSetSkeletonViz, handleSetFocusedWidgetId
    ]);

    return (
        <EditorContext.Provider value={contextValue}>
            {children}
        </EditorContext.Provider>
    );
};
