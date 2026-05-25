# Bug: `bun run build:blinko:types` fails (OOM / missing implicit types)

## Summary
- **Observed:** `bun run build:blinko:types` fails.
  - First failure mode: Node/TS crashes with `JavaScript heap out of memory`.
  - Second failure mode (after reducing the graph): `TS2688: Cannot find type definition file for 'bowser'`.
- **Expected:** Declaration emit for the plugin typings completes and writes `.d.ts` output under `blinko-types/dist/types`.
- **Status:** Report created manually because `scripts/create_bug_folder.py` and `assets/BUG_TEMPLATE.md` were not found in this repo.

## Repro Steps
- [ ] From repo root: `bun run build:blinko:types`
- [ ] Observe either:
  - [ ] `FATAL ERROR: ... heap out of memory` (tsc process aborts)
  - [ ] `error TS2688: Cannot find type definition file for 'bowser'`

## Expected Behavior
- [ ] Command exits `0`.
- [ ] Output exists at `blinko-types/dist/types/app/src/store/plugin/index.d.ts`.

## Actual Behavior
- [ ] Command aborts with OOM, or fails fast with TS2688.

## Root Causes
- [ ] **Huge type graph for declaration emit**: `app/src/store/plugin/index.ts` imported a large portion of the app (trpc, stores, i18n, etc.) purely to express `Window.Blinko` types. When used as the entry point for `tsconfig.blinko.json` (declaration emit), `tsc` walks and analyses a massive dependency graph and can exceed the default Node heap.
- [ ] **`typeRoots` + stub `@types/*` packages**: base `tsconfig.json` sets `compilerOptions.typeRoots`. That makes TypeScript implicitly include *every* package under `node_modules/@types`. `@types/bowser` is a stub package (no `.d.ts` file), so `tsc` throws `TS2688`.

## Fix Plan (Implemented)
- [x] Make plugin typings lightweight (no heavy imports)
  - [x] Rewrote `app/src/store/plugin/index.ts` to remove runtime imports and define a minimal `PluginApi` + global `Window.Blinko` typing with `unknown`/structural types.
  - [x] This also avoids creating large runtime import chains when `pluginManagerStore.ts` imports `BasePlugin` from this module.
- [x] Prevent implicit inclusion of all `@types/*` packages for this build
  - [x] Added `compilerOptions.types: []` to `tsconfig.blinko.json` so the declaration emit does not try to load every `@types/*` package.
- [x] Increase Node heap for this script (defensive)
  - [x] Updated root `package.json` script to run `tsc` with `NODE_OPTIONS=--max-old-space-size=8192` via `cross-env`.

## Validation
- [x] `bun run build:blinko:types` succeeds.
- [x] Output file exists: `blinko-types/dist/types/app/src/store/plugin/index.d.ts`.
- [x] `bun run build:web` succeeds.
- [x] `bun run test:api-local` and `bun run test:integration` succeed.

## Acceptance Criteria
- [x] Type declaration build completes reliably on typical developer machines.
- [x] No large unintended runtime import graph is introduced by plugin type definitions.
