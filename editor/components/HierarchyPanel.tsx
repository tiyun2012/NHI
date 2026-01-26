
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Entity, ComponentType } from '@/types';
import { SceneGraph } from '@/engine/SceneGraph';
import { Icon } from './Icon';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { TreeView, TreeNode } from './framework/TreeView';

interface HierarchyPanelProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

const getEntityIcon = (entity: Entity) => {
    if (entity.components[ComponentType.LIGHT]) return 'Sun';
    if (entity.components[ComponentType.TRANSFORM] && Object.keys(entity.components).length === 1) return 'Circle'; 
    if (entity.name.includes('Camera')) return 'Video';
    if (entity.components[ComponentType.PARTICLE_SYSTEM]) return 'Sparkles';
    return 'Box';
};

const getEntityColor = (entity: Entity) => {
    if (entity.components[ComponentType.LIGHT]) return 'text-yellow-500';
    if (entity.components[ComponentType.PARTICLE_SYSTEM]) return 'text-orange-500';
    return 'text-blue-400';
};

// Convert SceneGraph to TreeNode structure
const buildSceneTree = (
    sceneGraph: SceneGraph, 
    entities: Map<string, Entity>, 
    rootIds: string[]
): TreeNode[] => {
    return rootIds.map(id => {
        const entity = entities.get(id);
        const children = sceneGraph.getChildren(id);
        
        return {
            id,
            label: entity ? entity.name : 'Unknown',
            icon: entity ? getEntityIcon(entity) : 'Box',
            iconColor: entity ? getEntityColor(entity) : undefined,
            data: entity,
            children: children.length > 0 ? buildSceneTree(sceneGraph, entities, children) : []
        };
    });
};

export const HierarchyPanel: React.FC<HierarchyPanelProps> = ({ entities, sceneGraph, selectedIds, onSelect }) => {
  const rootIds = sceneGraph.getRootIds();
  const entityMap = useMemo(() => new Map(entities.map(entity => [entity.id, entity])), [entities]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, visible: boolean } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  
  const api = useEngineAPI();

  // Rebuild tree structure on changes
  const treeData = useMemo(() => {
      // If searching, flatten tree or filter
      if (searchTerm) {
          return entities
              .filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(e => ({
                  id: e.id,
                  label: e.name,
                  icon: getEntityIcon(e),
                  iconColor: getEntityColor(e),
                  children: []
              }));
      }
      return buildSceneTree(sceneGraph, entityMap, rootIds);
  }, [entities, sceneGraph, rootIds, searchTerm]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, id: node.id, visible: true });
    if (!selectedIds.includes(node.id)) onSelect([node.id]);
  };

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
        const entity = entityMap.get(id);
        if (entity && entity.name !== newName) {
             api.commands.scene.renameEntity(id, newName);
        }
    }
    setRenamingId(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: TreeNode) => {
      e.preventDefault();
      const childId = e.dataTransfer.getData('text/plain');
      if (!childId || childId === targetNode.id) return;
      
      // Prevent circular hierarchy check
      let current = sceneGraph.getParentId(targetNode.id);
      while (current) {
          if (current === childId) return;
          current = sceneGraph.getParentId(current);
      }
      
      api.commands.scene.reparentEntity(childId, targetNode.id);
  };

  const handleRootDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const childId = e.dataTransfer.getData('text/plain');
      if (!childId) return;
      api.commands.scene.reparentEntity(childId, null);
  };

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="p-2 border-b border-white/5 bg-black/20 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
            <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-black/40 text-xs py-1 pl-7 pr-2 rounded outline-none border border-transparent focus:border-accent text-white placeholder:text-white/20 transition-all" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-colors"
            title="Create Empty Entity"
            onClick={() => api.commands.scene.createEntity('New Object')}
        >
            <Icon name="Plus" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        <div 
            className="flex items-center gap-2 text-xs text-text-primary px-3 py-1 font-semibold opacity-70 cursor-default"
            onClick={() => onSelect([])}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleRootDrop}
        >
            <Icon name="Cuboid" size={12} />
            <span>MainScene</span>
        </div>
        
        <TreeView 
            data={treeData}
            selectedIds={selectedIds}
            onSelect={(ids, multi) => {
                 if (multi) {
                     const set = new Set([...selectedIds, ...ids]);
                     // Toggle logic if single click with shift/ctrl
                     if (selectedIds.includes(ids[0])) set.delete(ids[0]);
                     onSelect(Array.from(set));
                 } else {
                     onSelect(ids);
                 }
            }}
            onContextMenu={handleContextMenu}
            onDragStart={(e, node) => {
                e.dataTransfer.setData('text/plain', node.id);
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDrop={handleDrop}
            onRename={handleRename}
            renamingId={renamingId}
            indentSize={16}
            className="mt-1"
        />
      </div>
      
      <div className="px-2 py-1 text-[9px] text-text-secondary bg-black/20 border-t border-white/5 flex justify-between items-center shrink-0">
        <span>{entities.length} Objects</span>
      </div>

      {contextMenu && contextMenu.visible && createPortal(
        <div 
            className="fixed bg-[#252525] border border-white/10 shadow-2xl rounded py-1 min-w-[140px] text-xs z-[10000]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2"
                onClick={() => { setRenamingId(contextMenu.id); setContextMenu(null); }}
            >
                <Icon name="Edit2" size={12} /> Rename
            </div>
            <div 
                className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2"
                onClick={() => { api.commands.scene.duplicateEntity(contextMenu.id); setContextMenu(null); }}
            >
                <Icon name="Copy" size={12} /> Duplicate
            </div>
            <div className="border-t border-white/10 my-1"></div>
            <div 
                className="px-3 py-1.5 hover:bg-red-500/20 hover:text-red-400 cursor-pointer flex items-center gap-2"
                onClick={() => { api.commands.scene.deleteEntity(contextMenu.id); onSelect([]); setContextMenu(null); }}
            >
                <Icon name="Trash2" size={12} /> Delete
            </div>
        </div>,
        document.body
      )}
    </div>
  );
};
