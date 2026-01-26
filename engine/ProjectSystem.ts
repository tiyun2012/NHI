
import { assetManager } from './AssetManager';
import { consoleService } from './Console';
import { Asset } from '@/types';
import { eventBus } from './EventBus';

class ProjectSystemService {
    private rootHandle: FileSystemDirectoryHandle | null = null;
    private projectRootName: string = 'Project';

    async openProject() {
        if (!('showDirectoryPicker' in window)) {
            alert("Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.");
            return;
        }

        try {
            // 1. Open Directory Picker
            // @ts-ignore - File System Access API
            const handle = await window.showDirectoryPicker();
            this.rootHandle = handle;
            this.projectRootName = handle.name;

            // 2. Clear current engine state
            assetManager.clear();
            consoleService.info(`Opening project: ${this.projectRootName}...`, 'Project');

            // 3. Recursively scan and load
            await this.scanDirectory(this.rootHandle, `/${this.projectRootName}`);
            
            consoleService.success(`Project Loaded: ${this.projectRootName}`, 'Project');
            
            // 4. Notify UI to navigate to the new project root
            eventBus.emit('PROJECT_OPENED', { rootPath: `/${this.projectRootName}` });

        } catch (e: any) {
            if (e.name === 'AbortError') return; // User cancelled
            consoleService.error(`Failed to open project: ${e.message}`, 'Project');
        }
    }

    private async scanDirectory(dirHandle: any, currentPath: string) {
        // Register the folder asset itself
        if (currentPath !== '/') {
            const folderName = currentPath.split('/').pop()!;
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            assetManager.registerAsset({
                id: `folder_${currentPath}`,
                name: folderName,
                type: 'FOLDER',
                path: parentPath
            });
        }

        for await (const entry of dirHandle.values()) {
            const entryPath = `${currentPath}/${entry.name}`;
            
            if (entry.kind === 'directory') {
                // Recurse
                await this.scanDirectory(entry, entryPath);
            } else if (entry.kind === 'file') {
                await this.loadFile(entry, currentPath);
            }
        }
    }

    private async loadFile(fileHandle: any, parentPath: string) {
        const file = await fileHandle.getFile();
        const name = file.name;
        const ext = name.split('.').pop()?.toLowerCase();
        
        try {
            // 1. JSON Assets (.ti3d)
            if (ext === 'ti3d') {
                const text = await file.text();
                const json = JSON.parse(text);
                
                if (json.type && json.id) {
                    const asset = json as Asset;
                    asset.path = parentPath; // Force path to match actual file structure
                    assetManager.registerAsset(asset);
                    // IMPORTANT: Notify UI that this asset exists
                    eventBus.emit('ASSET_CREATED', { id: asset.id, type: asset.type });
                }
            } 
            // 2. 3D Models (.obj, .fbx, .glb)
            else if (['obj', 'fbx', 'glb', 'gltf'].includes(ext || '')) {
                const buffer = await file.arrayBuffer();
                // importFile automatically emits ASSET_CREATED
                const asset = await assetManager.importFile(name, buffer, (ext === 'fbx' || ext === 'glb') ? 'SKELETAL_MESH' : 'MESH', 0.01, true);
                if (asset) {
                    asset.path = parentPath;
                    // Re-emit update to sync the path change
                    eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
                }
            }
            // 3. Textures
            else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
                const blob = await file.slice(0, file.size, file.type);
                const url = URL.createObjectURL(blob);
                
                // Create texture asset manually to inject path
                const asset = assetManager.createTexture(name, url);
                asset.path = parentPath;
                // Force update UI
                eventBus.emit('ASSET_UPDATED', { id: asset.id, type: 'TEXTURE' });
            }
        } catch (e) {
            console.warn(`Skipped file ${name}:`, e);
        }
    }
}

export const projectSystem = new ProjectSystemService();
