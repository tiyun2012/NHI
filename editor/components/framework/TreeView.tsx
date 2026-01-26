
import React, { useState } from 'react';
import { Icon } from '@/editor/components/Icon';
import { InlineRename } from './InlineRename';

export interface TreeNode {
    id: string;
    label: string;
    icon?: string;
    iconColor?: string;
    children?: TreeNode[];
    data?: any; 
    isExpanded?: boolean;
}

interface TreeViewProps {
    data: TreeNode[];
    selectedIds: string[];
    onSelect: (ids: string[], multi: boolean) => void;
    onRename?: (id: string, newName: string) => void;
    onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
    onDragStart?: (e: React.DragEvent, node: TreeNode) => void;
    onDrop?: (e: React.DragEvent, targetNode: TreeNode) => void;
    renderLabel?: (node: TreeNode) => React.ReactNode;
    renamingId?: string | null;
    className?: string;
    indentSize?: number;
}

const TreeNodeItem: React.FC<{
    node: TreeNode;
    depth: number;
    props: TreeViewProps;
}> = ({ node, depth, props }) => {
    const [localExpanded, setLocalExpanded] = useState(true);
    const isExpanded = node.isExpanded ?? localExpanded;
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = props.selectedIds.includes(node.id);
    
    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLocalExpanded(!localExpanded);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        props.onSelect([node.id], e.ctrlKey || e.metaKey || e.shiftKey);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (props.onDrop) props.onDrop(e, node);
    };

    return (
        <div className="select-none">
            <div 
                className={`flex items-center py-0.5 pr-2 cursor-pointer transition-colors border-l-2 group
                    ${isSelected 
                        ? 'bg-accent/10 border-accent' 
                        : 'border-transparent hover:bg-transparent'}
                `}
                style={{ paddingLeft: `${depth * (props.indentSize || 12) + 6}px` }}
                onClick={handleClick}
                onContextMenu={(e) => props.onContextMenu?.(e, node)}
                draggable={!!props.onDragStart}
                onDragStart={(e) => props.onDragStart?.(e, node)}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleDrop}
            >
                {/* Expander */}
                <div 
                    onClick={handleExpand}
                    className={`w-4 h-4 flex items-center justify-center mr-0.5 rounded hover:bg-white/10 shrink-0 transition-opacity
                        ${hasChildren ? 'visible' : 'invisible'}
                        ${isSelected ? 'text-accent' : 'text-text-secondary group-hover:text-white'}
                    `}
                >
                    <Icon name={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={10} />
                </div>

                {/* Icon */}
                {node.icon && (
                    <Icon 
                        name={node.icon as any} 
                        size={12} 
                        className={`mr-2 shrink-0 transition-colors
                            ${isSelected ? 'text-accent' : (node.iconColor || 'text-yellow-500')}
                            ${!isSelected && 'group-hover:text-white'}
                        `} 
                    />
                )}

                {/* Label or Rename Input */}
                {props.renamingId === node.id && props.onRename ? (
                    <InlineRename 
                        value={node.label} 
                        onCommit={(val) => props.onRename!(node.id, val)} 
                        onCancel={() => props.onRename!(node.id, node.label)} 
                    />
                ) : (
                    <span className={`truncate text-xs flex-1 transition-colors
                        ${isSelected ? 'text-accent font-bold' : 'text-text-secondary group-hover:text-white'}
                    `}>
                        {props.renderLabel ? props.renderLabel(node) : node.label}
                    </span>
                )}
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
                <div>
                    {node.children!.map(child => (
                        <TreeNodeItem key={child.id} node={child} depth={depth + 1} props={props} />
                    ))}
                </div>
            )}
        </div>
    );
};

export const TreeView: React.FC<TreeViewProps> = (props) => {
    return (
        <div className={`flex flex-col ${props.className || ''}`}>
            {props.data.map(node => (
                <TreeNodeItem key={node.id} node={node} depth={0} props={props} />
            ))}
        </div>
    );
};
