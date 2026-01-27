
import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { assetManager, RIG_TEMPLATES } from '@/engine/AssetManager';
import { EditorContext } from '@/editor/state/EditorContext';
import { WindowManagerContext } from './WindowManager';
import { engineInstance } from '@/engine/engine';
import { NodeGraph } from './NodeGraph';
import { ImportWizard } from './ImportWizard';
import { StaticMeshEditor } from './StaticMeshEditor';
import { Asset, AssetType } from '@/types';
import { eventBus } from '@/engine/EventBus';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { projectSystem } from '@/engine/ProjectSystem';

// Framework Imports
import { TreeView, TreeNode } from './framework/TreeView';
import { ItemView, ItemData } from './framework/ItemView';

type ViewMode = 'GRID' | 'LIST';

const getFormatBadge = (type: AssetType): string => {
    switch (type) {
        case 'MESH': return 'GEO';
        case 'SKELETAL_MESH': return 'SKEL';
        case 'MATERIAL': return 'MAT';
        case 'TEXTURE': return 'TEX';
        case 'SCRIPT': return 'JS';
        case 'RIG': return 'RIG';
        case 'SCENE': return 'MAP';
        case 'PHYSICS_MATERIAL': return 'PHY';
        case 'SKELETON': return 'BONE';
        default: return '';
    }
};

const getAssetIcon = (type: AssetType): string => {
    return type === 'FOLDER' ? 'Folder' : (
        type === 'MATERIAL' ? 'Palette' : (
        type === 'MESH' ? 'Box' : (
        type === 'SKELETAL_MESH' ? 'PersonStanding' : (
        type === 'TEXTURE' ? 'Image' : (
        type === 'SCRIPT' ? 'FileCode' : (
        type === 'RIG' ? 'GitBranch' : (
        type === 'SCENE' ? 'Clapperboard' : 
        type === 'SKELETON' ? 'Bone' : 'File'
    )))))));
};

const getAssetColor = (type: AssetType): string => {
    return type === 'FOLDER' ? 'text-yellow-500' : (
        type === 'MATERIAL' ? 'text-emerald-400' : (
        type === 'MESH' ? 'text-blue-400' : (
        type === 'SKELETAL_MESH' ? 'text-purple-400' : 'text-text-secondary'
    )));
};

// Map assets to generic TreeNodes
const buildFolderTree = (assets: Asset[], rootPrefix: string): TreeNode[] => {
    // Filter folders that are part of the target hierarchy (starts with rootPrefix)
    const folders = assets.filter(a => {
        if (!a || a.type !== 'FOLDER') return false;
        const fullPath = (a.path === '/' ? '' : a.path) + '/' + a.name;
        // Include root prefix itself (if it matches an asset name) or children
        return fullPath === rootPrefix || fullPath.startsWith(rootPrefix + '/');
    });
    
    // Create map for easy lookup
    const map = new Map<string, TreeNode>();
    
    // Create nodes
    folders.forEach(f => {
        const fullPath = (f.path === '/' ? '' : f.path) + '/' + f.name;
        map.set(fullPath, {
            id: fullPath, 
            label: f.name,
            icon: 'Folder',
            iconColor: 'text-yellow-500',
            data: f,
            children: []
        });
    });

    const roots: TreeNode[] = [];
    
    // Link nodes
    folders.forEach(f => {
        const fullPath = (f.path === '/' ? '' : f.path) + '/' + f.name;
        const node = map.get(fullPath);
        
        if (node) {
            if (fullPath === rootPrefix) {
                 roots.push(node);
            } else {
                 // Try to find parent in map. Parent path is f.path.
                 // Note: f.path for "/Content/Materials" is "/Content".
                 const parentNode = map.get(f.path);
                 if (parentNode) {
                     parentNode.children!.push(node);
                 } else if (f.path === '/') {
                     // If parent is root '/', and it's not in map (shouldn't happen for prefixes), treat as root
                     // But we are filtering by prefix, so if prefix is /Content, we expect /Content to be root.
                 }
            }
        }
    });

    // Sort
    const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => a.label.localeCompare(b.label));
        nodes.forEach(n => sortNodes(n.children!));
    };
    sortNodes(roots);
    return roots;
};

export const ProjectPanel: React.FC = () => {
    const { selectedAssetIds, setSelectedAssetIds, setInspectedNode } = useContext(EditorContext)!;
    const wm = useContext(WindowManagerContext);
    const api = useEngineAPI();
    
    const [currentPath, setCurrentPath] = useState('/Content');
    const [viewMode, setViewMode] = useState<ViewMode>('GRID');
    const [assets, setAssets] = useState<Asset[]>([]);
    const [search, setSearch] = useState('');
    const [showImport, setShowImport] = useState(false);
    
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const isResizing = useRef(false);
    
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'BG' | 'ASSET', assetId?: string } | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);

    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

    const refresh = () => setAssets(assetManager.getAllAssets());

    useEffect(() => {
        refresh();
        const u1 = eventBus.on('ASSET_CREATED', refresh);
        const u2 = eventBus.on('ASSET_DELETED', refresh);
        const u3 = eventBus.on('ASSET_UPDATED', refresh);
        
        // Reset path to Content on project clear
        const u4 = eventBus.on('PROJECT_RESET', () => {
            refresh();
            setCurrentPath('/Content');
            setSelectedAssetIds([]);
        });
        
        // Navigate to new project root when opened
        const u5 = eventBus.on('PROJECT_OPENED', (payload: any) => {
             // Force refresh assets first to ensure the new folder structure is visible
             const newAssets = assetManager.getAllAssets();
             setAssets(newAssets);
             
             if (payload.rootPath) {
                 setCurrentPath(payload.rootPath);
             } else {
                 // Fallback if no path provided, try to find a custom root
                 const customRoot = newAssets.find(a => a.type === 'FOLDER' && a.path === '/' && a.name !== 'Content' && a.name !== 'Engine');
                 if (customRoot) setCurrentPath(`/${customRoot.name}`);
             }
             setSelectedAssetIds([]);
        });
        
        return () => { u1(); u2(); u3(); u4(); u5(); };
    }, []);

    useEffect(() => {
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    const contentTree = useMemo(() => buildFolderTree(assets, '/Content'), [assets]);
    const engineTree = useMemo(() => buildFolderTree(assets, '/Engine'), [assets]);
    
    // Dynamic tree for custom project roots (if user opens a folder outside Content/Engine)
    const customTree = useMemo(() => {
        // Find roots that are NOT /Content or /Engine
        const customRoots = assets.filter(a => a.type === 'FOLDER' && a.path === '/' && a.name !== 'Content' && a.name !== 'Engine');
        if (customRoots.length > 0) {
            return customRoots.flatMap(r => buildFolderTree(assets, `/${r.name}`));
        }
        return [];
    }, [assets]);

    // Map filtered assets to ItemView Data
    const displayItems = useMemo<ItemData[]>(() => {
        const filtered = assets.filter(a => {
            if (!a) return false;
            if (search) return a.name.toLowerCase().includes(search.toLowerCase());
            return a.path === currentPath;
        }).sort((a, b) => {
            if (a.type === 'FOLDER' && b.type !== 'FOLDER') return -1;
            if (a.type !== 'FOLDER' && b.type === 'FOLDER') return 1;
            return a.name.localeCompare(b.name);
        });
        
        // Add ".." if applicable
        const items: ItemData[] = [];
        if (currentPath !== '/Content' && currentPath !== '/Engine' && !search && currentPath !== '/') {
             items.push({
                 id: '__UP__',
                 label: '..',
                 icon: 'Folder',
                 iconColor: 'text-text-secondary opacity-50',
                 data: { type: 'NAV_UP' }
             });
        }

        items.push(...filtered.map(a => ({
            id: a.id,
            label: a.name,
            icon: getAssetIcon(a.type),
            iconColor: getAssetColor(a.type),
            badge: getFormatBadge(a.type),
            // SAFETY CHECK: Ensure we don't crash if 'a' is malformed or source is missing on non-texture
            previewUrl: (a.type === 'TEXTURE' && 'source' in a) ? (a as any).source : undefined,
            data: a
        })));
        
        return items;
    }, [assets, currentPath, search]);

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
        setSelectedAssetIds([]);
    };

    const handleBreadcrumb = (index: number) => {
        const parts = currentPath.split('/').filter(Boolean);
        const newPath = '/' + parts.slice(0, index + 1).join('/');
        handleNavigate(newPath);
    };

    const handleCreate = (type: AssetType) => {
        if (type === 'MATERIAL') assetManager.createMaterial('New Material', undefined, currentPath);
        if (type === 'SCRIPT') assetManager.createScript('New Script', currentPath);
        if (type === 'RIG') assetManager.createRig('New Rig', undefined, currentPath);
        if (type === 'SCENE') assetManager.createScene('New Scene', '{}', currentPath);
        if (type === 'FOLDER') assetManager.createFolder('New Folder', currentPath);
        if (type === 'PHYSICS_MATERIAL') assetManager.createPhysicsMaterial('New Physics Mat', undefined, currentPath);
        if (type === 'SKELETON') assetManager.createSkeleton('New Skeleton', currentPath);
    };

    const handleOpen = (id: string) => {
        if (id === '__UP__') {
            handleNavigate(currentPath.split('/').slice(0, -1).join('/') || '/');
            return;
        }

        const asset = assetManager.getAsset(id);
        if (!asset) return;

        if (asset.type === 'FOLDER') {
            handleNavigate(`${currentPath === '/' ? '' : currentPath}/${asset.name}`);
        } else if (asset.type === 'MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG') {
            setEditingAsset(asset);
        } else if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            if (wm) {
                const winId = `asset_editor_${asset.id}`;
                wm.openWindow(winId, {
                    id: winId,
                    title: `Editing: ${asset.name}`,
                    icon: asset.type === 'SKELETAL_MESH' ? 'PersonStanding' : 'Box',
                    content: <StaticMeshEditor assetId={asset.id} />,
                    width: 900,
                    height: 600,
                    initialPosition: { x: window.innerWidth / 2 - 450, y: window.innerHeight / 2 - 300 }
                });
            }
        } else if (asset.type === 'SCENE') {
            if (confirm("Load Scene? Unsaved changes will be lost.")) {
                api.commands.scene.loadSceneFromAsset(asset.id);
            }
        }
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete Asset?")) {
            assetManager.deleteAsset(id);
            if (selectedAssetIds.includes(id)) setSelectedAssetIds([]);
        }
    };

    const handleRename = (id: string, newName: string) => {
        if (newName.trim()) assetManager.renameAsset(id, newName.trim());
        setRenamingId(null);
    };

    const handleOpenProject = () => {
        if (confirm("Opening a new project will clear the current session. Continue?")) {
            projectSystem.openProject();
        }
    };

    const pathParts = currentPath.split('/').filter(Boolean);

    return (
        <div className="h-full flex flex-col bg-[#1a1a1a] text-xs font-sans relative" onContextMenu={(e) => e.preventDefault()}>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 border-b border-white/5 bg-panel-header shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={handleOpenProject} className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded transition-colors" title="Open Local Folder">
                        <Icon name="FolderOpen" size={12} /> Open
                    </button>
                    <button onClick={() => setShowImport(true)} className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded transition-colors shadow-sm">
                        <Icon name="Upload" size={12} /> Import
                    </button>
                    <div className="h-4 w-px bg-white/10 mx-1"></div>
                    <button onClick={() => handleCreate('MATERIAL')} className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white" title="New Material"><Icon name="Palette" size={14}/></button>
                    <button onClick={() => handleCreate('SCRIPT')} className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white" title="New Script"><Icon name="FileCode" size={14}/></button>
                    <button onClick={() => handleCreate('RIG')} className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white" title="New Rig"><Icon name="GitBranch" size={14}/></button>
                    <button onClick={() => handleCreate('FOLDER')} className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-white" title="New Folder"><Icon name="FolderPlus" size={14}/></button>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-black/20 border border-white/5 rounded px-2 py-1 text-white outline-none focus:border-accent w-32 transition-all focus:w-48"
                    />
                    <div className="flex bg-black/20 rounded p-0.5 border border-white/5">
                        <button onClick={() => setViewMode('GRID')} className={`p-1 rounded ${viewMode==='GRID'?'bg-white/10 text-white':'text-text-secondary'}`}><Icon name="LayoutGrid" size={12}/></button>
                        <button onClick={() => setViewMode('LIST')} className={`p-1 rounded ${viewMode==='LIST'?'bg-white/10 text-white':'text-text-secondary'}`}><Icon name="List" size={12}/></button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="flex flex-col border-r border-white/5 bg-black/20 overflow-y-auto custom-scrollbar shrink-0" style={{ width: sidebarWidth }}>
                    {/* Opened Project Root(s) */}
                    {customTree.length > 0 && (
                        <>
                             <div className="p-2 font-bold text-text-secondary uppercase text-[10px] tracking-wider mb-0.5 sticky top-0 bg-[#1e1e1e] border-b border-white/5 z-10">Local Project</div>
                             <TreeView 
                                data={customTree} 
                                selectedIds={[currentPath]} 
                                onSelect={(ids) => handleNavigate(ids[0])}
                                className="mb-4"
                             />
                        </>
                    )}

                    <div className="p-2 font-bold text-text-secondary uppercase text-[10px] tracking-wider mb-0.5 sticky top-0 bg-[#1e1e1e] border-b border-white/5 z-10 border-t">Assets</div>
                    <TreeView 
                        data={contentTree} 
                        selectedIds={[currentPath]} 
                        onSelect={(ids) => handleNavigate(ids[0])} // TreeNode ID is the path here
                        className="mb-4"
                    />
                    <div className="p-2 font-bold text-text-secondary uppercase text-[10px] tracking-wider mb-0.5 sticky top-0 bg-[#1e1e1e] border-b border-white/5 z-10 border-t">Engine</div>
                    <TreeView 
                        data={engineTree} 
                        selectedIds={[currentPath]} 
                        onSelect={(ids) => handleNavigate(ids[0])}
                    />
                </div>

                {/* Resizer */}
                <div className="w-1 bg-transparent hover:bg-accent/50 cursor-ew-resize transition-colors z-10"
                    onMouseDown={(e) => { 
                        const startX = e.clientX; const startW = sidebarWidth;
                        const onMove = (m: MouseEvent) => setSidebarWidth(Math.max(150, Math.min(600, startW + (m.clientX - startX))));
                        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
                    }}
                />

                {/* Right Grid */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#151515]">
                    {/* Breadcrumb */}
                    <div className="flex items-center px-3 py-1.5 border-b border-white/5 bg-black/10 gap-1 overflow-x-auto custom-scrollbar shrink-0">
                        <Icon name="Home" size={10} className="text-text-secondary opacity-70" />
                        {pathParts.map((part, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <Icon name="ChevronRight" size={10} className="text-text-secondary opacity-50" />}
                                <button onClick={() => handleBreadcrumb(i)} className={`hover:text-white ${i===pathParts.length-1?'text-white font-bold':'text-text-secondary'}`}>{part}</button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Item View */}
                    <div 
                        className="flex-1 overflow-y-auto p-0 custom-scrollbar"
                        onClick={() => setSelectedAssetIds([])}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'BG' });
                        }}
                    >
                        <ItemView 
                            items={displayItems}
                            viewMode={viewMode}
                            selectedIds={selectedAssetIds}
                            renamingId={renamingId}
                            onSelect={(id, multi) => {
                                if (id === '__UP__') return;
                                if (multi) setSelectedAssetIds([...selectedAssetIds, id]);
                                else setSelectedAssetIds([id]);
                                setInspectedNode(null); 
                            }}
                            onAction={handleOpen}
                            onContextMenu={(e, id) => {
                                if (id === '__UP__') return;
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'ASSET', assetId: id });
                                setSelectedAssetIds([id]);
                            }}
                            onRename={handleRename}
                            draggable={true}
                            emptyText="Right-click to create items"
                        />
                    </div>
                </div>
            </div>

            {/* Modals & Context Menus */}
            {showImport && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-8">
                    <div className="w-full max-w-lg h-[500px] bg-panel border border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 bg-panel-header flex justify-between items-center">
                            <span className="font-bold text-white">Import Asset</span>
                            <button onClick={() => setShowImport(false)}><Icon name="X" size={16} /></button>
                        </div>
                        <ImportWizard onClose={() => setShowImport(false)} onImportSuccess={(id) => {
                                const asset = assetManager.getAsset(id);
                                if (asset && asset.type !== 'FOLDER') asset.path = currentPath;
                                refresh();
                        }} />
                    </div>
                </div>
            )}

            {editingAsset && (
                <div className="absolute inset-0 bg-[#101010] z-[60] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                    <div className="h-8 bg-panel-header border-b border-white/10 flex items-center justify-between px-3 shrink-0">
                        <div className="flex items-center gap-2 font-bold text-white"><Icon name="Edit" size={14} className="text-accent" />{editingAsset.name}</div>
                        <button onClick={() => setEditingAsset(null)} className="p-1 hover:bg-white/10 rounded text-text-secondary hover:text-white"><Icon name="X" size={16} /></button>
                    </div>
                    <div className="flex-1 overflow-hidden relative"><NodeGraph assetId={editingAsset.id} /></div>
                </div>
            )}

            {contextMenu && createPortal(
                <div className="fixed bg-[#252525] border border-white/10 shadow-2xl rounded py-1 min-w-[160px] text-xs z-[9999]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
                    {contextMenu.type === 'BG' && (
                        <>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { handleCreate('FOLDER'); setContextMenu(null); }}><Icon name="FolderPlus" size={14} /> New Folder</div>
                            <div className="border-t border-white/10 my-1"></div>
                            {['SCENE', 'MATERIAL', 'SCRIPT', 'RIG', 'PHYSICS_MATERIAL', 'SKELETON'].map(t => (
                                <div key={t} className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { handleCreate(t as AssetType); setContextMenu(null); }}>{t}</div>
                            ))}
                        </>
                    )}
                    {contextMenu.type === 'ASSET' && contextMenu.assetId && (
                        <>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { 
                                const newId = api.commands.scene.createEntityFromAsset(contextMenu.assetId!, { x: 0, y: 0, z: 0 });
                                if (newId) api.commands.selection.setSelected([newId]);
                                setContextMenu(null);
                            }}><Icon name="PlusSquare" size={14} /> Place in Scene</div>
                            <div className="border-t border-white/10 my-1"></div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { setRenamingId(contextMenu.assetId!); setContextMenu(null); }}><Icon name="Edit2" size={14} /> Rename</div>
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { assetManager.duplicateAsset(contextMenu.assetId!); setContextMenu(null); refresh(); }}><Icon name="Copy" size={14} /> Duplicate</div>
                            <div className="border-t border-white/10 my-1"></div>
                            <div className="px-3 py-1.5 hover:bg-red-500/20 hover:text-red-400 cursor-pointer flex items-center gap-2" onClick={() => { handleDelete(contextMenu.assetId!); setContextMenu(null); }}><Icon name="Trash2" size={14} /> Delete</div>
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};
