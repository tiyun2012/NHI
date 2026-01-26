
import React from 'react';
import { Icon } from '@/editor/components/Icon';
import { InlineRename } from './InlineRename';

export interface ItemData {
    id: string;
    label: string;
    icon: string;
    iconColor?: string;
    badge?: string;
    previewUrl?: string;
    data?: any;
}

interface ItemViewProps {
    items: ItemData[];
    viewMode: 'GRID' | 'LIST';
    selectedIds: string[];
    onSelect: (id: string, multi: boolean) => void;
    onAction: (id: string) => void; // Double click
    onContextMenu: (e: React.MouseEvent, id: string) => void;
    onRename?: (id: string, newName: string) => void;
    renamingId?: string | null;
    draggable?: boolean;
    emptyText?: string;
}

export const ItemView: React.FC<ItemViewProps> = ({ 
    items, viewMode, selectedIds, onSelect, onAction, onContextMenu, 
    onRename, renamingId, draggable, emptyText 
}) => {
    
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary opacity-20 pointer-events-none select-none">
                <Icon name="MousePointer2" size={32} />
                <span className="mt-2 text-[10px]">{emptyText || "No Items"}</span>
            </div>
        );
    }

    return (
        <div className={viewMode === 'GRID' ? 'grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 p-2' : 'flex flex-col gap-1 p-2'}>
            {items.map(item => {
                const isSelected = selectedIds.includes(item.id);
                const isRenaming = renamingId === item.id;

                return (
                    <div 
                        key={item.id}
                        className={`group relative flex cursor-pointer transition-colors border border-transparent rounded
                            ${viewMode === 'GRID' ? 'flex-col items-center p-2' : 'flex-row items-center px-2 py-1'}
                            ${isSelected ? 'bg-accent/10 border-accent/30' : 'hover:border-transparent'}
                        `}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            onAction(item.id);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenu(e, item.id);
                        }}
                        draggable={draggable}
                        onDragStart={(e) => {
                             if (draggable) e.dataTransfer.setData('application/ti3d-asset', item.id);
                        }}
                    >
                        {/* Icon / Preview */}
                        <div className={`
                            ${viewMode === 'GRID' ? 'w-12 h-12 mb-2 bg-black/20' : 'w-6 h-6 mr-3'} 
                            rounded flex items-center justify-center shrink-0 relative overflow-hidden
                        `}>
                            {item.previewUrl ? (
                                <img src={item.previewUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <Icon 
                                    name={item.icon as any} 
                                    size={viewMode === 'GRID' ? 24 : 14} 
                                    className={`transition-colors ${isSelected ? 'text-accent' : (item.iconColor || 'text-text-secondary')} group-hover:text-white`} 
                                />
                            )}

                            {/* Badge */}
                            {viewMode === 'GRID' && item.badge && (
                                <div className="absolute bottom-0 right-0 bg-black/60 text-[8px] px-1 text-white/70 font-mono backdrop-blur-sm rounded-tl">
                                    {item.badge}
                                </div>
                            )}
                        </div>

                        {/* Label / Rename */}
                        {isRenaming && onRename ? (
                            <InlineRename 
                                value={item.label}
                                onCommit={(val) => onRename(item.id, val)}
                                onCancel={() => onRename(item.id, item.label)} 
                                className={viewMode === 'GRID' ? 'text-center' : ''}
                            />
                        ) : (
                            <div className={`flex flex-col min-w-0 ${viewMode === 'GRID' ? 'w-full items-center' : 'flex-1'}`}>
                                <span className={`text-xs truncate w-full ${viewMode === 'GRID' ? 'text-center' : 'text-left'} ${isSelected ? 'text-accent font-bold' : 'text-text-primary group-hover:text-white'}`}>
                                    {item.label}
                                </span>
                                {viewMode === 'LIST' && item.badge && (
                                     <span className="text-[9px] text-text-secondary opacity-50 ml-auto font-mono">{item.badge}</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
