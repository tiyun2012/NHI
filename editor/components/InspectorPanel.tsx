
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Entity, Asset, GraphNode, ComponentType, SelectionType, StaticMeshAsset, MeshComponentMode, PhysicsMaterialAsset, InspectorProps, TransformSpace, EngineModule } from '@/types';
import { assetManager } from '@/engine/AssetManager';
import { Icon } from './Icon';
import { EditorContext } from '@/editor/state/EditorContext';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { uiRegistry } from '@/editor/registries/UIRegistry';

// Modular UI
import { NumberInput, Checkbox, PanelSection, Button } from '@/editor/components/ui';
// Add missing import for SkeletonDisplayOptions
import { SkeletonDisplayOptions } from '@/editor/toolOptions/SkeletonDisplayOptions';

interface InspectorPanelProps {
  object: Entity | Asset | GraphNode | null;
  selectionCount?: number;
  type?: SelectionType;
  isClone?: boolean;
}

const MeshModeSelector: React.FC<{ object: Entity }> = ({ object }) => {
    const { meshComponentMode, setMeshComponentMode } = useContext(EditorContext)!;
    
    const hasMesh = object.components['Mesh'] !== undefined;
    if (!hasMesh) return null;

    const modes: { id: MeshComponentMode, icon: string, title: string }[] = [
        { id: 'OBJECT', icon: 'Box', title: 'Object Mode' },
        { id: 'VERTEX', icon: 'Target', title: 'Vertex Mode' },
        { id: 'EDGE', icon: 'Move', title: 'Edge Mode' },
        { id: 'FACE', icon: 'Square', title: 'Face Mode' },
    ];

    return (
        <div className="flex bg-black/20 rounded p-1 gap-1 mx-4 my-2 border border-white/5">
            {modes.map(m => (
                <button 
                    key={m.id}
                    onClick={() => setMeshComponentMode(m.id)}
                    className={`flex-1 p-1.5 rounded flex justify-center items-center transition-all ${meshComponentMode === m.id ? 'bg-accent text-white shadow-sm' : 'hover:bg-white/10 text-text-secondary hover:text-white'}`}
                    title={m.title}
                >
                    <Icon name={m.icon as any} size={14} />
                </button>
            ))}
        </div>
    );
};

const getEntityInfo = (entity: Entity) => {
    if (entity.components[ComponentType.LIGHT]) return { icon: 'Sun', color: 'bg-yellow-500', label: 'Light' };
    if (entity.components[ComponentType.PARTICLE_SYSTEM]) return { icon: 'Sparkles', color: 'bg-orange-500', label: 'Particle System' };
    if (entity.components[ComponentType.MESH]) return { icon: 'Box', color: 'bg-blue-600', label: 'Static Mesh' };
    if (entity.components[ComponentType.VIRTUAL_PIVOT]) return { icon: 'Maximize', color: 'bg-emerald-600', label: 'Helper' };
    if (entity.name.includes('Camera')) return { icon: 'Video', color: 'bg-red-500', label: 'Camera' };
    return { icon: 'Cuboid', color: 'bg-gray-600', label: 'Entity' };
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ object: initialObject, selectionCount = 0, type: initialType = 'ENTITY', isClone = false }) => {
  const api = useEngineAPI();
  const [isLocked, setIsLocked] = useState(isClone);
  const [snapshot, setSnapshot] = useState<{ object: any, type: any } | null>(null);
  const [name, setName] = useState('');
  const [refresh, setRefresh] = useState(0); 
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [, setRegistryTick] = useState(0);

  useEffect(() => {
    return api.subscribe('ui:registryChanged', () => setRegistryTick(t => t + 1));
  }, [api]);

  const activeObject = isLocked ? (snapshot?.object ?? initialObject) : initialObject;
  const activeType = isLocked ? (snapshot?.type ?? initialType) : initialType;

  const entity = useMemo((): Entity | null => {
      if (!activeObject) return null;
      if (activeType === 'ENTITY') return activeObject as Entity;
      if (['VERTEX', 'EDGE', 'FACE'].includes(activeType as string) && (activeObject as any).components) {
          return activeObject as Entity;
      }
      return null;
  }, [activeObject, activeType]);

  const entityInfo = entity ? getEntityInfo(entity) : { icon: 'Box', color: 'bg-blue-500', label: 'Object' };

  useEffect(() => {
    if (!isLocked) {
        setSnapshot(prev => {
            if (prev?.object === initialObject && prev?.type === initialType) return prev;
            return { object: initialObject, type: initialType };
        });
    }
  }, [initialObject, initialType, isLocked]);

  useEffect(() => { if (activeObject && activeType === 'ENTITY') setName(activeObject.name); }, [activeObject, activeType]);

  const toggleLock = (e: React.MouseEvent) => {
    e.stopPropagation(); setIsLocked(!isLocked);
    if (!isLocked) setSnapshot({ object: initialObject, type: initialType });
  };

  const updateComponent = (compType: string, field: string, value: any) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      const entity = activeObject as Entity;
      const comp = entity.components[compType];
      if (comp) { 
          (comp as any)[field] = value; 
          api.commands.ui.notify(); 
      }
  };
  
  const addComponent = (compType: string) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      api.commands.scene.addComponent((activeObject as Entity).id, compType);
      setShowAddComponent(false);
  };

  const removeComponent = (compType: string) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      api.commands.scene.removeComponent((activeObject as Entity).id, compType);
  };

  const dynamicSections = useMemo(() => [
    ...uiRegistry.getSections('INSPECTOR'),
    ...uiRegistry.getSections('GLOBAL')
  ], [/* tick */]);

  if (!activeObject) {
    return (
        <div className="h-full bg-panel flex flex-col items-center justify-center text-text-secondary select-none">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4"><Icon name="BoxSelect" size={32} className="opacity-50" /></div>
            <span className="text-xs font-semibold">{selectionCount > 1 ? `${selectionCount} Objects Selected` : 'No Selection'}</span>
        </div>
    );
  }

  const renderHeaderControls = () => (
    <div className="flex items-center gap-1.5 ml-auto">
        <button onClick={toggleLock} className={`p-1 rounded transition-colors ${isLocked ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-white'}`}><Icon name={isLocked ? "Lock" : "Unlock"} size={13} /></button>
    </div>
  );

  if (activeType === 'ENTITY') {
      const modules = api.queries.registry.getModules();
      const availableModules = modules.filter(m => !entity!.components[m.id]);

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20" onClick={() => setShowAddComponent(false)}>
          <div className="p-4 border-b border-black/20 bg-panel-header">
             <div className="flex items-center gap-3 mb-3">
                 <div className={`w-8 h-8 ${entityInfo.color} rounded flex items-center justify-center text-white shadow-sm shrink-0`} title={entityInfo.label}>
                    <Icon name={entityInfo.icon as any} size={16} />
                 </div>
                 <div className="flex-1 min-w-0">
                     <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={() => { if(activeObject.name!==name) { api.commands.scene.renameEntity((activeObject as Entity).id, name); } }} className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-accent transition-colors truncate" />
                     <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-accent font-bold uppercase tracking-wider bg-accent/10 px-1.5 rounded">{entityInfo.label}</span>
                        <div className="text-[10px] text-text-secondary font-mono truncate select-all opacity-50">{entity!.id.substring(0,8)}...</div>
                     </div>
                 </div>
                 <input type="checkbox" checked={entity!.isActive} onChange={(e) => { api.commands.history.pushState(); entity!.isActive = e.target.checked; api.commands.ui.notify(); }} className="cursor-pointer" title="Active" />
                 {renderHeaderControls()}
             </div>
          </div>
          
          {entity && <MeshModeSelector object={entity} />}

          <div className="flex-1 overflow-y-auto custom-scrollbar">
              {modules.map(mod => {
                  const comp = entity!.components[mod.id];
                  if (!comp) return null;
                  return (
                      <PanelSection 
                          key={mod.id} 
                          title={mod.name} 
                          icon={mod.icon}
                          rightElement={mod.id !== 'Transform' ? (
                              <button className="p-1 hover:text-white text-text-secondary" title="Remove" onClick={(e) => { e.stopPropagation(); removeComponent(mod.id); }}><Icon name="Trash2" size={12} /></button>
                          ) : undefined}
                      >
                          <mod.InspectorComponent 
                              entity={entity!}
                              component={comp}
                              onUpdate={(f, v) => updateComponent(mod.id, f, v)}
                              onStartUpdate={() => api.commands.history.pushState()}
                              onCommit={() => api.commands.ui.notify()}
                          />
                      </PanelSection>
                  );
              })}

              {/* Dynamically registered widgets via API for this entity context */}
              {dynamicSections.map(section => (
                  <PanelSection key={section.id} title={section.title} icon={section.icon}>
                      <section.component />
                  </PanelSection>
              ))}

              <div className="p-4 flex justify-center pb-8 relative">
                <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setShowAddComponent(!showAddComponent); }}>Add Component</Button>
                {showAddComponent && (
                    <div className="absolute top-12 w-48 bg-[#252525] border border-white/10 shadow-xl rounded-md z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {availableModules.length > 0 ? (
                            availableModules.map(m => (
                                <button key={m.id} className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-white flex items-center gap-2 text-gray-300" onClick={() => addComponent(m.id)}>
                                    <Icon name={m.icon as any} size={12} /> {m.name}
                                </button>
                            ))
                        ) : <div className="px-3 py-2 text-xs text-text-secondary italic">No components available</div>}
                    </div>
                )}
             </div>
          </div>
        </div>
      );
  }

  if (['VERTEX', 'EDGE', 'FACE'].includes(activeType as string)) {
      const subSel = api.queries.selection.getSubSelection();
      let count = 0; let label = '';
      if (activeType === 'VERTEX') { count = subSel.vertexIds.size; label = 'Vertices'; }
      if (activeType === 'EDGE') { count = subSel.edgeIds.size; label = 'Edges'; }
      if (activeType === 'FACE') { count = subSel.faceIds.size; label = 'Faces'; }

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white"><Icon name="Target" size={16} /></div>
                 <div className="flex-1 min-w-0 font-bold">{label} Selection</div>
                 {renderHeaderControls()}
            </div>
            
            {entity && <MeshModeSelector object={entity} />}

            <div className="p-4 space-y-4 text-xs overflow-y-auto custom-scrollbar">
                <div className="bg-black/20 p-3 rounded border border-white/5 flex justify-between items-center">
                    <div>
                        <div className="text-2xl font-mono text-white mb-1">{count}</div>
                        <div className="text-text-secondary uppercase text-[10px] font-bold">{label} Selected</div>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  if (activeType === 'ASSET') {
      const asset = activeObject as Asset;
      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white"><Icon name="File" size={16} /></div>
                 <div className="flex-1 min-w-0 font-bold">{asset.name}</div>
                 {renderHeaderControls()}
            </div>
            <div className="p-4 space-y-4">
                {asset.type === 'PHYSICS_MATERIAL' && (
                    <>
                        <NumberInput label="Static Friction" value={Number((asset as PhysicsMaterialAsset).data.staticFriction)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {staticFriction:v}); setRefresh(r=>r+1); }} step={0.05} />
                        <NumberInput label="Dynamic Friction" value={Number((asset as PhysicsMaterialAsset).data.dynamicFriction)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {dynamicFriction:v}); setRefresh(r=>r+1); }} step={0.05} />
                        <NumberInput label="Bounciness" value={Number((asset as PhysicsMaterialAsset).data.bounciness)} onChange={v => { assetManager.updatePhysicsMaterial(asset.id, {bounciness:v}); setRefresh(r=>r+1); }} step={0.05} />
                    </>
                )}

                {(asset.type === 'SKELETON' || asset.type === 'SKELETAL_MESH') && (
                    <>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider pt-2 border-t border-white/5">
                            <Icon name="Bone" size={12} /> Skeleton Context
                        </div>
                        <div className="text-xs text-text-secondary">
                            Bones: {((asset as any).skeleton?.bones?.length ?? 0)}
                        </div>
                        <SkeletonDisplayOptions />
                    </>
                )}
            </div>
        </div>
      );
  }

  return <div className="p-4">Node Inspector</div>;
};
