# Patch notes ("better" zip)

This zip includes a small set of safety + stability improvements on top of the last update:

- **EditorBoot init is StrictMode-safe**: boot-time registration moved into `useEffect` and guarded with a module-level `didBootInit` flag to avoid double-registration in React dev StrictMode.
- **`window.ti3d` is now DEV-only** and cleaned up on unmount.
- **AI generation UI is DEV-only**: the "Generate Script" action is disabled in production builds (matches the existing "Run Script" gating).
- **Removed `importmap` from `index.html`** to avoid version mismatches and to keep the project "Vite-first".

No engine/runtime logic was changed beyond the boot-time initialization order.
