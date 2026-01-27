
import React, { useEffect, useContext } from 'react';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { EditorContext } from '@/editor/state/EditorContext';

export const EditorShortcuts: React.FC = () => {
    const api = useEngineAPI();
    const ctx = useContext(EditorContext);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const active = document.activeElement;
                const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
                if (!isInput && ctx?.selectedIds.length && ctx.selectionType === 'ENTITY') {
                    // Only delete if main viewport or hierarchy is focused
                    const focused = ctx.focusedWidgetId;
                    if (focused === 'hierarchy' || focused === 'VIEWPORT' || !focused) {
                        e.preventDefault();
                        ctx.selectedIds.forEach(id => api.commands.scene.deleteEntity(id));
                        ctx.setSelectedIds([]);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [ctx?.selectedIds, ctx?.selectionType, ctx?.focusedWidgetId, api]);

    return null;
};
