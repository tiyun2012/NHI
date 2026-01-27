
import React, { useState, useCallback, useMemo, useContext } from 'react';
import { DraggableWindow } from './DraggableWindow';
import { Icon } from './Icon';
import { EditorContext } from '@/editor/state/EditorContext';

export interface WindowItem {
    id: string;
    title: string;
    icon: string;
    content: React.ReactNode;
    width?: number;
    height?: number | string;
    initialPosition?: { x: number, y: number };
    isOpen: boolean;
    isNested: boolean;
    zIndex: number;
}

export interface WindowManagerContextType {
    openWindow: (id: string, configIfMissing?: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => void;
    closeWindow: (id: string) => void;
    toggleWindow: (id: string) => void;
    registerWindow: (config: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => void;
    bringToFront: (id: string) => void;
}

export const WindowManagerContext = React.createContext<WindowManagerContextType | null>(null);

export const WindowManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { setFocusedWidgetId } = useContext(EditorContext)!;
    const [windows, setWindows] = useState<Record<string, WindowItem>>({});
    const [maxZ, setMaxZ] = useState(100);

    const registerWindow = useCallback((config: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => {
        setWindows(prev => {
            const existing = prev[config.id];
            if (existing) {
                // Update config while preserving runtime state:
                return {
                    ...prev,
                    [config.id]: {
                        ...existing,
                        ...config,
                        // Preserve state
                        isOpen: existing.isOpen,
                        isNested: existing.isNested,
                        zIndex: existing.zIndex,
                    }
                };
            }
            // Create new
            return {
                ...prev,
                [config.id]: { ...config, isOpen: false, isNested: false, zIndex: 100 }
            };
        });
    }, []);

    // Only update Z-Index (UI Stacking)
    const bringToFront = useCallback((id: string) => {
        setMaxZ(prev => {
            const nextZ = prev + 1;
            setWindows(curr => {
                if (!curr[id]) return curr; // Safety check
                return {
                    ...curr,
                    [id]: { ...curr[id], zIndex: nextZ }
                };
            });
            return nextZ;
        });
    }, []);

    // Handle Logic Focus (Context)
    const focusWindow = useCallback((id: string) => {
        setFocusedWidgetId(id);
    }, [setFocusedWidgetId]);

    const openWindow = useCallback((id: string, configIfMissing?: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => {
        setWindows(prev => {
            let win = prev[id];
            
            // Auto-register if missing and config provided (Fixes race condition)
            if (!win && configIfMissing) {
                 win = { ...configIfMissing, isOpen: false, isNested: false, zIndex: 100 };
            }

            if (!win) {
                // If still missing, we can't open it.
                return prev; 
            }

            return { ...prev, [win.id]: { ...win, isOpen: true, isNested: false } };
        });
        
        // Schedule Z-update. 
        // Note: bringToFront uses setMaxZ/setWindows which will run in the next render cycle or batch.
        // If window was just added in the previous setWindows, it will be available for bringToFront's reducer.
        bringToFront(id);
        focusWindow(id);
    }, [bringToFront, focusWindow]);

    const closeWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isOpen: false } } : prev);
    }, []);

    const toggleWindow = useCallback((id: string) => {
        setWindows(prev => {
            const win = prev[id];
            if (!win) return prev;
            const newState = !win.isOpen;
            if (newState) {
                // If opening, bring to front
                setTimeout(() => {
                    bringToFront(id);
                    focusWindow(id);
                }, 0);
            }
            return { ...prev, [id]: { ...win, isOpen: newState, isNested: false } };
        });
    }, [bringToFront, focusWindow]);

    const nestWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isNested: true } } : prev);
    }, []);

    const restoreWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isNested: false, isOpen: true } } : prev);
        bringToFront(id);
        focusWindow(id);
    }, [bringToFront, focusWindow]);

    const activeWindows = useMemo(() => (Object.values(windows) as WindowItem[]).filter(w => w.isOpen && !w.isNested), [windows]);
    const nestedWindows = useMemo(() => (Object.values(windows) as WindowItem[]).filter(w => w.isOpen && w.isNested), [windows]);

    const contextValue = useMemo(() => ({ 
        openWindow, 
        closeWindow, 
        toggleWindow, 
        registerWindow, 
        bringToFront 
    }), [openWindow, closeWindow, toggleWindow, registerWindow, bringToFront]);

    return (
        <WindowManagerContext.Provider value={contextValue}>
            {children}

            {/* Floating Windows Layer */}
            {activeWindows.map(win => (
                <div key={win.id} style={{ zIndex: win.zIndex, position: 'fixed', pointerEvents: 'none' }}>
                    <DraggableWindow
                        id={win.id}
                        title={win.title}
                        icon={win.icon}
                        width={win.width}
                        height={win.height}
                        initialPosition={win.initialPosition}
                        onClose={() => closeWindow(win.id)}
                        onNest={() => nestWindow(win.id)}
                        className="pointer-events-auto" // Re-enable pointer events for the window itself
                        onInteract={() => bringToFront(win.id)}
                        onFocus={() => focusWindow(win.id)}
                        onMouseEnter={() => focusWindow(win.id)} // Focus on hover (Mouse-follows-focus style)
                        children={win.content}
                    />
                </div>
            ))}

            {/* Left Side Bubble Dock */}
            {nestedWindows.length > 0 && (
                <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[9999] flex flex-col gap-4 transition-all pointer-events-auto">
                    {nestedWindows.map(win => (
                        <div key={win.id} className="relative group">
                            <button
                                onClick={() => restoreWindow(win.id)}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-[#1e1e1e]/90 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:bg-accent hover:border-accent hover:shadow-[0_0_20px_rgba(79,128,248,0.4)] hover:scale-110 active:scale-95 transition-all duration-300 group"
                                aria-label={`Restore ${win.title}`}
                            >
                                <Icon name={win.icon as any} size={22} className="text-text-secondary group-hover:text-white transition-colors" strokeWidth={1.5} />
                            </button>
                            
                            {/* Floating Tooltip */}
                            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-[#252525] border border-white/10 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 shadow-xl pointer-events-none whitespace-nowrap z-50">
                                {win.title}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[#252525] border-l border-b border-white/10 rotate-45"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </WindowManagerContext.Provider>
    );
};
