
import { assetManager } from './AssetManager';
import { consoleService } from './Console';
import { Asset, SkeletalMeshAsset } from '@/types';
import { eventBus } from './EventBus';

class ProjectSystemService {
    private rootHandle: FileSystemDirectoryHandle | null = null;
    private projectRootName: string = 'Project';

    async openProject() {
        // Prefer File System Access API (best UX + true directory handles)
        if ('showDirectoryPicker' in window) {
            try {
                // @ts-ignore - File System Access API
                const handle = await window.showDirectoryPicker();
                this.rootHandle = handle;
                this.projectRootName = handle.name;

                assetManager.clear();
                consoleService.info(`Opening project: ${this.projectRootName}...`, 'Project');

                await this.scanDirectory(this.rootHandle, `/${this.projectRootName}`);

                consoleService.success(`Project Loaded: ${this.projectRootName}`, 'Project');
                // Ensure immediate UI update
                setTimeout(() => {
                    eventBus.emit('PROJECT_OPENED', { rootPath: `/${this.projectRootName}` });
                }, 50);
                return;
            } catch (e: any) {
                if (e?.name === 'AbortError') return; // User cancelled
                consoleService.error(`Failed to open project: ${e?.message || e}`, 'Project');
                alert(`Failed to open project. Please check permissions. Error: ${e.message}`);
                return;
            }
        }

        // Fallback: <input webkitdirectory> (works in Chromium-based browsers and Safari; limited on Firefox)
        try {
            const files = await this.pickFolderViaInput();
            if (!files || files.length === 0) return;

            // Infer root folder name from the first file relative path (e.g. "MyProject/assets/a.ti3d")
            const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
            const rootName = String(firstRel).split('/')[0] || 'Project';
            this.rootHandle = null;
            this.projectRootName = rootName;

            assetManager.clear();
            consoleService.info(`Opening project (fallback): ${this.projectRootName}...`, 'Project');

            await this.loadFromFileList(files, this.projectRootName);

            consoleService.success(`Project Loaded: ${this.projectRootName}`, 'Project');
            setTimeout(() => {
                eventBus.emit('PROJECT_OPENED', { rootPath: `/${this.projectRootName}` });
            }, 50);
        } catch (e: any) {
            consoleService.error(`Failed to open project: ${e?.message || e}`, 'Project');
        }
    }

    private pickFolderViaInput(): Promise<File[]> {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            // @ts-ignore
            input.webkitdirectory = true;
            input.multiple = true;

            input.style.position = 'fixed';
            input.style.left = '-9999px';
            document.body.appendChild(input);

            const cleanup = () => {
                input.remove();
            };

            input.addEventListener('change', () => {
                const list = input.files ? Array.from(input.files) : [];
                cleanup();
                resolve(list);
            }, { once: true });

            input.addEventListener('cancel', () => {
                cleanup();
                resolve([]);
            }, { once: true } as any);

            // Trigger selector
            input.click();
        });
    }

    private async loadFromFileList(files: File[], rootName: string) {
        const rootPath = `/${rootName}`;

        // Create folder assets from all relative paths
        const relPaths = files
            .map(f => ((f as any).webkitRelativePath || f.name) as string)
            .filter(Boolean);

        this.registerFoldersFromRelativePaths(relPaths, rootName);

        // Ensure root folder exists (matches scanDirectory behavior)
        assetManager.registerAsset({
            id: `folder_${rootPath}`,
            name: rootName,
            type: 'FOLDER',
            path: '/'
        });

        // Load each file using the same rules as handle-based loading
        for (const file of files) {
            const rel = ((file as any).webkitRelativePath || file.name) as string;
            const parts = rel.split('/');
            // parent relative dir includes rootName
            const parentRel = parts.length > 1 ? parts.slice(0, -1).join('/') : rootName;
            const parentPath = `/${parentRel}`;
            await this.loadRawFile(file, parentPath);
        }
    }

    private registerFoldersFromRelativePaths(relPaths: string[], rootName: string) {
        const folderSet = new Set<string>();

        for (const rel of relPaths) {
            const parts = rel.split('/');
            // accumulate folders excluding the file name
            for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                folderSet.add(`/${dir}`);
            }
        }

        // Register in path-length order so parents exist first
        const folders = Array.from(folderSet).sort((a, b) => a.length - b.length);
        for (const currentPath of folders) {
            if (currentPath === '/' || currentPath === `/${rootName}`) continue;
            const folderName = currentPath.split('/').pop()!;
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            assetManager.registerAsset({
                id: `folder_${currentPath}`,
                name: folderName,
                type: 'FOLDER',
                path: parentPath
            });
        }
    }

    private async loadRawFile(file: File, parentPath: string) {
        const name = file.name;
        const ext = name.split('.').pop()?.toLowerCase();

        try {
            if (ext === 'ti3d') {
                const text = await file.text();
                const json = JSON.parse(text);

                if (json.type && json.id) {
                    const asset = json as Asset;
                    asset.path = parentPath;
                    assetManager.registerAsset(asset);
                    eventBus.emit('ASSET_CREATED', { id: asset.id, type: asset.type });
                }
            } else if (['obj', 'fbx', 'glb', 'gltf'].includes(ext || '')) {
                const buffer = await file.arrayBuffer();
                const asset = await assetManager.importFile(
                    name,
                    buffer,
                    (ext === 'fbx' || ext === 'glb') ? 'SKELETAL_MESH' : 'MESH',
                    0.01,
                    true
                );
                if (asset) {
                    // Update Path (importFile sets default /Content/...)
                    asset.path = parentPath;
                    
                    // If Skeletal, also fix the Skeleton Asset path
                    if (asset.type === 'SKELETAL_MESH') {
                        const skel = asset as SkeletalMeshAsset;
                        if (skel.skeletonAssetId) {
                            const skeletonAsset = assetManager.getAsset(skel.skeletonAssetId);
                            if (skeletonAsset) {
                                skeletonAsset.path = parentPath;
                            }
                        }
                    }
                    
                    eventBus.emit('ASSET_UPDATED', { id: asset.id, type: asset.type });
                }
            } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
                const url = URL.createObjectURL(file);
                const asset = assetManager.createTexture(name, url);
                asset.path = parentPath;
                eventBus.emit('ASSET_UPDATED', { id: asset.id, type: 'TEXTURE' });
            }
        } catch (e) {
            console.warn(`Skipped file ${name}:`, e);
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
        await this.loadRawFile(file, parentPath);
    }
}

export const projectSystem = new ProjectSystemService();
