import { EngineModule, ModuleContext, IGameSystem, ComponentType } from '@/types';

class ModuleManagerService {
    private modules: Map<string, EngineModule> = new Map();
    private activeSystems: IGameSystem[] = [];
    private context: ModuleContext | null = null;

    private ecsUnsubscribe: (() => void) | null = null;

    /**
     * Initialize the module manager with a runtime context.
     *
     * This method is safe to call more than once (e.g. hot-reload, engine re-creation):
     * - unsubscribes the previous ECS listener
     * - calls system.dispose() on active systems (if implemented)
     * - rebuilds activeSystems from registered modules
     */
    init(context: ModuleContext) {
        // Clean up previous wiring if re-initialized
        const prevContext = this.context;
        if (this.ecsUnsubscribe) {
            this.ecsUnsubscribe();
            this.ecsUnsubscribe = null;
        }
        if (prevContext && this.activeSystems.length > 0) {
            for (const sys of this.activeSystems) {
                try {
                    sys.dispose?.(prevContext);
                } catch (e) {
                    console.warn(`[moduleManager] system.dispose failed for ${sys.id}`, e);
                }
            }
        }

        this.context = context;
        this.activeSystems = [];

        // Wire up ECS Events to Systems
        this.ecsUnsubscribe = context.ecs.subscribe((type: string, entityId: string, componentType?: ComponentType) => {
            // Snapshot to avoid issues if a system is added/removed mid-dispatch
            const systems = this.activeSystems.slice();
            systems.forEach(sys => {
                if (type === 'ENTITY_DESTROYED' && sys.onEntityDestroyed) {
                    sys.onEntityDestroyed(entityId, context);
                } else if (type === 'COMPONENT_ADDED' && componentType && sys.onComponentAdded) {
                    sys.onComponentAdded(entityId, componentType, context);
                } else if (type === 'COMPONENT_REMOVED' && componentType && sys.onComponentRemoved) {
                    sys.onComponentRemoved(entityId, componentType, context);
                }
            });
        });

        // Init modules registered before Engine init
        this.modules.forEach(m => {
            this.initializeModule(m);
        });

        this.sortActiveSystems();
    }

    private initializeModule(module: EngineModule) {
        if (!this.context) return;

        // Legacy hook
        if (module.onRegister) module.onRegister(this.context);

        // System Init
        if (module.system) {
            if (module.system.init) module.system.init(this.context);
            if (module.system.order === undefined) {
                module.system.order = module.order;
            }
            // Deduplicate systems by id
            if (!this.activeSystems.find(s => s.id === module.system!.id)) {
                this.activeSystems.push(module.system);
                this.sortActiveSystems();
            }
        }
    }

    // Ordering rule: systems run in ascending order (system.order or module.order),
    // with system.id as a deterministic tie-breaker.
    private sortActiveSystems() {
        this.activeSystems.sort((a, b) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.id.localeCompare(b.id);
        });
    }

    register(module: EngineModule) {
        const existing = this.modules.get(module.id);
        if (existing) {
            console.warn(`Module ${module.id} already registered. Overwriting.`);
            // If overwriting while initialized, remove/dispose old system so we don't leak it.
            if (this.context && existing.system) {
                this.activeSystems = this.activeSystems.filter(s => s.id !== existing.system!.id);
                try {
                    existing.system.dispose?.(this.context);
                } catch (e) {
                    console.warn(`[moduleManager] system.dispose failed for ${existing.system.id}`, e);
                }
            }
        }

        this.modules.set(module.id, module);

        if (this.context) {
            this.initializeModule(module);
        }
    }

    getModule(id: string) {
        return this.modules.get(id);
    }

    getAllModules() {
        return Array.from(this.modules.values()).sort((a, b) => a.order - b.order);
    }

    /**
     * Optional cleanup for engine shutdown.
     */
    dispose() {
        if (!this.context) return;
        const ctx = this.context;

        if (this.ecsUnsubscribe) {
            this.ecsUnsubscribe();
            this.ecsUnsubscribe = null;
        }

        for (const sys of this.activeSystems) {
            try {
                sys.dispose?.(ctx);
            } catch (e) {
                console.warn(`[moduleManager] system.dispose failed for ${sys.id}`, e);
            }
        }

        this.activeSystems = [];
        this.context = null;
    }

    // Called by Engine loop
    update(dt: number) {
        if (!this.context) return;

        // 1. Run Systems (New Pipeline)
        this.activeSystems.forEach(sys => {
            if (sys.update) sys.update(dt, this.context!);
        });

        // 2. Run Legacy Module Hooks (Deprecated but supported)
        this.modules.forEach(m => {
            if (m.onUpdate) m.onUpdate(dt, this.context!);
        });
    }

    // Called by Renderer
    render(gl: WebGL2RenderingContext, viewProj: Float32Array) {
        if (!this.context) return;

        // 1. Run Systems (New Pipeline)
        this.activeSystems.forEach(sys => {
            if (sys.render) sys.render(gl, viewProj, this.context!);
        });

        // 2. Run Legacy Module Hooks
        this.modules.forEach(m => {
            if (m.onRender) m.onRender(gl, viewProj, this.context!);
        });
    }
}

export const moduleManager = new ModuleManagerService();
