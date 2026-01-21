
import React from 'react';
import type { EngineModule } from '@/engine/core/moduleHost';
import { UVEditorPanel } from './components/UVEditorPanel';
import { useEngineAPI } from '@/engine/api/EngineProvider';

// UV Selection Inspector Widget
const UVSelectionInfo: React.FC = () => {
    const api = useEngineAPI();
    const subSel = api.queries.selection.getSubSelection();
    const count = subSel.uvIds.size;
    
    // Check if we should display (only if UVs are selected or in UV mode)
    if (count === 0) return null;

    return React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center justify-between text-xs bg-black/20 p-2 rounded' },
            React.createElement('span', { className: 'text-text-secondary' }, 'Selected UVs'),
            React.createElement('span', { className: 'font-mono text-white font-bold' }, count)
        ),
        React.createElement('div', { className: 'flex gap-2' },
            React.createElement('button', {
                className: 'flex-1 bg-white/5 hover:bg-white/10 text-xs py-1 rounded text-text-secondary hover:text-white transition-colors',
                onClick: () => api.commands.selection.clearSubSelection()
            }, 'Clear Selection')
        ),
        React.createElement('div', { className: 'text-[10px] text-text-secondary italic' },
            'Use the UV Editor window to manipulate coordinates.'
        )
    );
};

export const UVEditorModule: EngineModule = {
    id: 'uv-editor',
    init(ctx) {
        // Register the tool window
        ctx.commands.ui?.registerWindow?.({
            id: 'uveditor',
            title: 'UV Editor',
            icon: 'LayoutGrid',
            component: UVEditorPanel,
            width: 500,
            height: 500,
            initialPosition: { x: 200, y: 200 }
        });

        // Register Inspector Section for UV Selection context
        ctx.commands.ui?.registerSection?.('INSPECTOR', {
            id: 'uv_selection_info',
            title: 'UV Data',
            icon: 'LayoutGrid',
            component: UVSelectionInfo,
            order: 5 
        });
    }
}
