# Elephant app layout

This folder contains the ElephantNote application code that was previously
spread across the MarkText/Electron scaffold.

## Build entry points

`pnpm dev` still starts `electron-vite dev` from the repository root.

- Main process entry: `src/main/index.js`
- Preload entry: `src/preload/index.js`
- Renderer HTML entry: `src/renderer/index.html`
- Renderer app entry: `src/renderer/src/main.js`

The Elephant-specific modules now live here and are imported through aliases.

## Folders

- `back/app`: Electron main-process ElephantNote logic, IPC handlers, vaults,
  search, sync, site preview, imports, and runtime services.
- `front/app`: Vue renderer ElephantNote interface, stores, services, assets,
  search UI, graph UI, editor host, library, settings, and site preview UI.
  The main components are grouped by interface area:
  - `components/shell`: app shell, top bar, main content, empty vault state.
  - `components/navigation`: sidebars, icon rail, navigation bar, tree rows.
  - `components/editor`: note editor host, editor bars, tag controls, dialogs.
  - `components/library`: note/folder cards, library grid and toolbar.
  - `components/views`: dashboard, calendar, chat, wiki, graph and canvas views.
  - `components/settings`: settings panel.
- `shared`: shared ElephantNote domain helpers used by both front and back.
- `tests/unit`: ElephantNote unit tests.

## Aliases

- `elephant-back/*` -> `Elephant/back/app/*`
- `elephant-front/*` -> `Elephant/front/app/*`
- `elephant-shared/*` -> `Elephant/shared/*`

Compatibility aliases are still kept for existing imports:

- `@/elephantnote/*`
- `common/elephantnote/*`
- `main_renderer/elephantnote/*`

## Legacy scaffold

The root `src` folder still contains the Electron/Vite entry points and the
legacy MarkText/Muya editor scaffold required by `pnpm dev`. Move those only
after replacing the entry points and validating Electron packaging.

## Refactor note

This version keeps the public aliases stable while extracting the preload bridge,
renderer API client, main-process config store, runtime singletons, legacy IPC
registration, and API action constants into smaller files. See
`../REFACTORING_REPORT.md` for details and for the list of root project files
that were not present in the uploaded archives.

## Architecture contract

The portable Elephant architecture is documented in
`../docs/dev/ELEPHANT_ARCHITECTURE.md`. New cross-process features should use the
shared API domain contract in `shared/apiContracts.js` before adding Electron
handlers or renderer UI.
