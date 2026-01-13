# Tool & Widget Modularity Notes

This repo had two pain points that made it hard to reuse tools in other widgets/windows:

1. **UI tool options lived in one large component** (`editor/components/ToolOptionsPanel.tsx`).
2. **Some tools were global singletons** (e.g. `SkeletonTool` imported `engineInstance`), which prevents
   instantiating tools per-engine or per-preview.

This patch introduces a small, incremental pattern that keeps compatibility with the current app,
while enabling reuse.

## UI: composable tool option blocks

`ToolOptionsPanel` is now composed from small components in `editor/toolOptions/*`.
Each block takes props (instead of reaching into `EditorContext` directly), so it can be embedded in:

- other windows (e.g. asset preview)
- modal dialogs
- future multi-viewport editors

Suggested next step: create a `ToolRegistry` that maps tool IDs to their option components.
The panel can then render a dynamic list of sections per tool.

## Engine: dependency-injected tools

`SkeletonTool` is now created inside `Engine` via dependency injection.

Benefits:
- no global singleton import
- you can create multiple engines (tests, asset previews) and each gets its own tool instance

Suggested next step: define a small common interface for tools (activate/deactivate + input hooks)
and register them via a registry/module-manager so viewports can mount the tools they need.
