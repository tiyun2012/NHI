
import { useState, useCallback } from 'react';
import { SceneGraph } from '@/engine/SceneGraph';
import { ToolType, MeshComponentMode } from '@/types';
import type { SelectionCommands } from '@/engine/selection';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { engineInstance } from '@/engine/engine';

export interface InteractionAPI {
    selection: Pick<SelectionCommands, 'selectLoop' | 'modifySubSelection' | 'setSelected' | 'clear' | 'clearSubSelection' | 'selectInRect' | 'focus'>;
    mesh: {
        setComponentMode: (mode: MeshComponentMode) => void;
    };
    scene: {
        deleteEntity: (id: string) => void;
        duplicateEntity: (id: string) => void;
        reparentEntity?: (childId: string, parentId: string | null) => void;
        renameEntity?: (id: string, name: string) => void;
        createEntity?: (name: string) => void;
        addComponent?: (id: string, type: string) => void;
        removeComponent?: (id: string, type: string) => void;
    };
    modeling: {
        extrudeFaces: () => void;
        bevelEdges: () => void;
        weldVertices: () => void;
        connectComponents: () => void;
        deleteSelectedFaces: () => void;
    };
    sculpt?: {
        setEnabled: (enabled: boolean) => void;
        setRadius: (radius: number) => void;
        setHeatmapVisible: (visible: boolean) => void;
    };
}

interface UsePieMenuProps {
    sceneGraph: SceneGraph;
    selectedIds: string[];
    currentMode: MeshComponentMode;
    onSelect: (ids: string[]) => void;
    setTool: (tool: ToolType) => void;
    setMeshComponentMode: (mode: MeshComponentMode) => void;
    handleFocus: () => void;
    handleModeSelect: (modeId: number) => void;
    api?: InteractionAPI; // Optional override
}

export const usePieMenuInteraction = ({
    sceneGraph,
    selectedIds,
    currentMode,
    onSelect,
    setTool,
    setMeshComponentMode,
    handleFocus,
    handleModeSelect,
    api: providedApi
}: UsePieMenuProps) => {
    const [pieMenuState, setPieMenuState] = useState<{ x: number, y: number, entityId?: string } | null>(null);
    const globalApi = useEngineAPI();
    
    // Use provided API or fallback to global
    const api = providedApi || globalApi.commands;

    const openPieMenu = useCallback((x: number, y: number, entityId?: string) => {
        setPieMenuState({ x, y, entityId });
    }, []);

    const closePieMenu = useCallback(() => setPieMenuState(null), []);

    const handlePieAction = useCallback((action: string) => {
        const handleLoopSelect = (mode: MeshComponentMode) => {
            // We assume the engine instance is relevant to the context, 
            // but for loop selection specifically, it relies on global engine.selectionSystem currently.
            // If using a local engine, the API implementation should handle the redirection.
            
            const effectiveMode: MeshComponentMode = (currentMode === 'UV' && mode === 'VERTEX') ? 'UV' : mode;
            setMeshComponentMode(effectiveMode);
            api.mesh.setComponentMode(effectiveMode);
            api.selection.selectLoop(effectiveMode);
        };

        // Tools
        if (action === 'tool_select') setTool('SELECT');
        if (action === 'tool_move') setTool('MOVE');
        if (action === 'tool_rotate') setTool('ROTATE');
        if (action === 'tool_scale') setTool('SCALE');
        
        // View
        if (action === 'toggle_grid') engineInstance.toggleGrid(); // Global toggle for now (or make API)
        if (action === 'toggle_wire') handleModeSelect(3); 
        if (action === 'reset_cam') handleFocus();
        if (action === 'focus') handleFocus();

        // Object Operations
        if (action === 'delete') { 
            selectedIds.forEach(id => api.scene.deleteEntity(id)); 
            onSelect([]); 
        }
        if (action === 'duplicate') { 
            selectedIds.forEach(id => api.scene.duplicateEntity(id)); 
        }

        // Modeling Operations
        if (action === 'extrude') api.modeling.extrudeFaces();
        if (action === 'bevel') api.modeling.bevelEdges();
        if (action === 'weld') api.modeling.weldVertices();
        if (action === 'connect') api.modeling.connectComponents();
        if (action === 'delete_face') api.modeling.deleteSelectedFaces();

        // --- PROTECTED SELECTION LOOPS ---
        if (action === 'loop_vert') handleLoopSelect('VERTEX');
        if (action === 'loop_edge') handleLoopSelect('EDGE');
        if (action === 'loop_face') handleLoopSelect('FACE');

        closePieMenu();
    }, [selectedIds, currentMode, sceneGraph, onSelect, setTool, setMeshComponentMode, handleFocus, handleModeSelect, closePieMenu, api]);

    return {
        pieMenuState,
        setPieMenuState,
        openPieMenu,
        closePieMenu,
        handlePieAction
    };
};