
# ti3D Engine Architecture & Contribution Guide

This document outlines the high-level architecture of the ti3D engine, identifies potential sources of conflict, and provides strict guidelines for adding new features (modules) safely.

---

## 1. High-Level Architecture

### Engine Layer
The core runtime is centered around a single `Engine` class (`engine/engine.ts`) that acts as the owner of:
- **ECS** (`SoAEntitySystem`): Manages entity data and component storage.
- **Scene Graph** (`SceneGraph`): Handles hierarchy and transform propagation.
- **Renderers**: `WebGLRenderer` (Mesh/PostProcess) and `DebugRenderer` (Gizmos/Lines).
- **Systems**: Core logic loops for Physics, Animation, Selection, Particles, etc.
- **State**: Simulation mode, global tool modes, timeline state, and performance metrics.

**Initialization Flow:**
1. `Engine` instantiates core subsystems.
2. `App.tsx` initializes the `EngineProvider`.
3. `initGL()` triggers `ModuleManager` initialization, injecting the `EngineContext` (engine, ecs, scene, gl) into all registered modules.

### Module System
The `ModuleManager` (`engine/ModuleManager.ts`) is the extension backbone. It is responsible for:
- **Registration**: Storing modules by ID.
- **Initialization**: Bootstrapping module systems with the `EngineContext`.
- **Deduplication**: Ensuring only one instance of a system ID runs.
- **Execution**: Running systems in deterministic order (via `order` property).
- **Event Dispatch**: Routing ECS events (`COMPONENT_ADDED`, etc.) to relevant systems.

### Editor/UI Layer
The React UI interacts with the engine through two primary channels:
1. **`EngineProvider` & `EngineAPI`**: Creates a stable boundary. The UI should use `useEngineAPI()` to dispatch commands (`commands.selection.setSelected(...)`) rather than mutating the engine directly.
2. **`EditorContext`**: Centralizes editor-specific state (Selection, Tool Modes, UI Config, Snap Settings). This ensures UI components (Inspector, Viewport, Toolbar) remain synchronized.

---

## 2. Conflict Sources & Risks

### Global Singleton (`engineInstance`)
*   **Risk**: The `engineInstance` singleton is currently imported directly in many UI components (`App.tsx`, `InspectorPanel.tsx`). This creates tight coupling and makes it easy to accidentally overwrite state or bypass the `EngineAPI` contract.
*   **Mitigation**: New features must strictly use `useEngineAPI` and `EditorContext`. Legacy code is being migrated gradually.

### Module Registry Overwrites
*   **Risk**: The `ModuleManager` overwrites an existing module if a new one is registered with the same ID. While useful for HMR (Hot Module Replacement), it causes silent failures if two distinct features accidentally share an ID (e.g., "Physics").
*   **Mitigation**: Use namespaced or highly specific IDs for new modules.

### Legacy vs. System Pipeline
*   **Risk**: The manager supports both modern `IGameSystem` (ECS-driven) and legacy module hooks (`onUpdate`). Mixing these in a single module can lead to double-updates or unpredictable behavior.
*   **Mitigation**: Prefer `IGameSystem` for all new runtime logic.

---

## 3. Guide: Adding New Modules (e.g., Sculpt)

To add a new feature without destabilizing the core, follow these four rules:

### A. Unique Identification
Give every module and system a unique, descriptive ID.
*   **Bad**: `id: 'Sculpt'` (Too generic)
*   **Good**: `id: 'tool-sculpt'`, System ID: `system-sculpt-deformation`

### B. Route UI via `EngineAPI`
Do not import `engineInstance` in your new UI components. Instead, extend the `EngineAPI` command structure.
1.  Define the command interface in `engine/api/EngineAPI.ts`.
2.  Implement the logic in `engine/api/createEngineAPI.ts`.
3.  Consume via `const api = useEngineAPI()` in React.

### C. Encapsulate Runtime Logic
Keep the heavy lifting inside a dedicated System within your Module.
*   **Do not** add `sculpt()` methods directly to the `Engine` class.
*   **Do** create a `SculptSystem` that listens for input or events and modifies mesh data via the ECS or AssetManager.

### D. Separation of Concerns
*   **UI**: Keep tool options (brush size, strength) in the React state or `EditorContext` if shared.
*   **Core**: Only add primitives to `Engine` if absolutely necessary (e.g., a low-level API to update vertex buffers efficiently). Avoid adding editor-specific flags (like `isSculpting`) to the main `Engine` class if they can be contained within the Module.

---

## 4. Folder Structure Standards

*   `app/`: Application entry point and providers.
*   `editor/`: React UI components, panels, and hooks.
*   `engine/`: Core runtime (ECS, Math, Scene, Renderers).
    *   `engine/api/`: The bridge between UI and Engine.
    *   `engine/modules/`: Core default modules.
*   `features/`: **[NEW]** Standalone feature directories (e.g., `features/sculpt/`) containing the Module, System, and related Commands/Events.
