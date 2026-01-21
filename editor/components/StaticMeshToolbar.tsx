
import React from 'react';
import { Icon } from './Icon';
import { ToolType, MeshComponentMode } from '@/types';

interface StaticMeshToolbarProps {
    tool: ToolType;
    setTool: (t: ToolType) => void;
    mode: MeshComponentMode;
    setMode: (m: MeshComponentMode) => void;
    showGrid: boolean;
    setShowGrid: (v: boolean) => void;
    showWireframe: boolean;
    setShowWireframe: (v: boolean) => void;
    onResetCamera: () => void;
    renderMode: number;
    setRenderMode: (m: number) => void;
}

const RENDER_MODE_ICONS = ['Sun', 'BoxSelect', 'Circle'];
const RENDER_MODE_LABELS = ['Lit', 'Flat', 'Normals'];

export const StaticMeshToolbar: React.FC<StaticMeshToolbarProps> = ({
    tool, setTool, mode, setMode,
    showGrid, setShowGrid,
    showWireframe, setShowWireframe,
    onResetCamera,
    renderMode, setRenderMode
}) => {
    return (
        <div className="h-10 bg-panel-header border-b border-white/5 flex items-center px-4 justify-between shrink-0 select-none z-20 relative">
            <div className="flex items-center gap-4">
                {/* Tools */}
                <div className="flex bg-black/20 p-0.5 rounded-lg gap-0.5">
                    {['SELECT','MOVE','ROTATE','SCALE'].map(t => (
                        <button key={t} className={`p-1.5 rounded hover:text-white transition-colors ${tool===t?'bg-white/10 text-white':'text-text-secondary'}`} onClick={() => setTool(t as any)}>
                            <Icon name={t==='SELECT'?'MousePointer2':(t==='MOVE'?'Move':(t==='ROTATE'?'RotateCw':'Maximize')) as any} size={14}/>
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Modes */}
                <div className="flex bg-black/20 p-0.5 rounded-lg gap-0.5">
                    {([
                        { id: 'OBJECT', icon: 'Box', title: 'Object Mode' },
                        { id: 'VERTEX', icon: 'Dot', title: 'Vertex Mode' },
                        { id: 'EDGE', icon: 'Minus', title: 'Edge Mode' },
                        { id: 'FACE', icon: 'Square', title: 'Face Mode' },
                        { id: 'UV', icon: 'LayoutGrid', title: 'UV Mode' },
                    ] as const).map(m => (
                        <button
                            key={m.id}
                            className={`p-1.5 rounded hover:text-white transition-colors ${mode===m.id?'bg-white/10 text-white':'text-text-secondary'}`}
                            onClick={() => setMode(m.id)}
                            title={m.title}
                        >
                            <Icon name={m.icon as any} size={14} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-2">
                 <button 
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-colors"
                    onClick={() => setRenderMode((renderMode + 1) % 3)}
                 >
                    <Icon name={RENDER_MODE_ICONS[renderMode] as any} size={14} className="text-accent" />
                    <span className="text-[10px] font-bold">{RENDER_MODE_LABELS[renderMode]}</span>
                 </button>
                 
                 <div className="h-4 w-px bg-white/10" />

                 <button className={`p-1.5 hover:text-white rounded ${showGrid?'text-accent':'text-text-secondary'}`} onClick={() => setShowGrid(!showGrid)} title="Toggle Grid"><Icon name="Grid" size={16}/></button>
                 <button className={`p-1.5 hover:text-white rounded ${showWireframe?'text-accent':'text-text-secondary'}`} onClick={() => setShowWireframe(!showWireframe)} title="Toggle Wireframe"><Icon name="Codepen" size={16}/></button>
                 <button className="p-1.5 hover:text-white rounded text-text-secondary" onClick={onResetCamera} title="Reset Camera"><Icon name="Home" size={16}/></button>
            </div>
        </div>
    );
}
