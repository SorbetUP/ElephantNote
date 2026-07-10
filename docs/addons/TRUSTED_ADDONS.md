# Full app access addons

ElephantNote supports two external addon execution models.

## Limited access

Limited access addons run in a dedicated Worker. They receive a small capability API and cannot directly access Vue, Pinia, Muya, the DOM, Tauri or browser networking.

Use this mode for reports, importers, task engines, templates, API clients and other features that can be expressed through the public brokered API.

## Full app access

Full app access addons run as JavaScript modules inside ElephantNote's renderer. They can modify the application deeply, including the editor, workspace, layout, settings, services and DOM.

A full app access addon can reach:

- the Vue application;
- the router and Pinia stores;
- ElephantNote services;
- the addon manager and contribution registry;
- the mutable application host registry;
- the DOM and browser globals;
- the Tauri bridge;
- unstable application internals.

This is intentionally comparable to the power available to desktop Obsidian plugins. It is not a security sandbox.

## Declaration

The package keeps the standard Worker-compatible runtime declaration so the current Rust package validator remains the single installation path. Full app access is declared in `contributes`:

```json
{
  "id": "com.example.deep-plugin",
  "name": "Deep Plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "runtime": {
    "type": "javascript-worker",
    "entry": "main.js"
  },
  "contributes": {
    "runtimeMode": "trusted"
  }
}
```

The entry is an ESM module:

```js
export default class DeepPlugin {
  async onload(api) {
    api.ui.registerStyle('.my-class { color: red; }')
    api.commands.register({
      id: 'com.example.deep-plugin.run',
      title: 'Run deep plugin',
      run() {}
    })
  }

  async onunload() {}
}
```

## Trust approval

Full app access approval is bound to:

- the addon id;
- the exact installed package hash.

Updating or rebuilding the package changes its hash and invalidates approval. The addon remains installed but cannot start until the user reviews and approves the new package.

The approval screen states that the addon may read or modify the application, editor, active vault and any capability available to ElephantNote.

## Safe mode and crash recovery

**Settings → Addons → Full app access safe mode** stops every running full app access addon and prevents trusted addons from starting automatically.

Safe mode does not:

- uninstall packages;
- delete addon data;
- disable built-in addons;
- disable limited access addons.

Before a trusted addon starts, ElephantNote writes an activation marker. If the renderer stops before activation completes, the next launch detects that marker, enables safe mode and clears the persisted startup state of trusted packages. This breaks addon-induced crash loops.

## Application host registry

The host registry is the stable escape hatch for changing application behavior without guessing globals:

```js
const services = api.resources.get('services')
const editor = api.resources.get('editor')

const disposeResource = api.resources.provide('myFeature', feature)
const disposeWatch = api.resources.watch('editor', ({ value }) => {
  console.log('active editor changed', value)
})
```

ElephantNote initially publishes resources including `window`, `document`, `tauri`, `marktext`, `elephantnote`, `fileUtils`, `router`, `pinia`, `services`, `vueApp`, `runtime`, `addons` and `addonManager`. Other runtime components can publish themselves later.

Published resources and watchers are removed automatically when the addon is disabled.

## Reversible patches

Trusted addons can replace or wrap real application behavior:

```js
const service = api.resources.get('services').example

api.patch.method(service, 'save', async (original, payload) => {
  const transformed = await api.patch.runHook('before-save', payload)
  return await original(transformed)
})

api.patch.property(service, 'mode', 'custom')
api.patch.hook('before-save', (payload) => ({ ...payload, taggedByAddon: true }))
```

Every patch records the previous method or property descriptor and restores it on unload.

## Vue and router mutation

```js
api.vue.component('MyAddonPanel', MyAddonPanel)
api.vue.directive('my-addon', directive)
api.vue.provide('my-addon-service', service)

api.router.addRoute({ path: '/my-addon', component: MyAddonPage })
api.router.beforeEach((to) => {
  // inspect or redirect navigation
})
```

Components, directives, injections, routes and guards are cleaned up automatically where Vue Router and Vue expose removal APIs.

## Settings extensions

Settings contributions are rendered by the application rather than stored as unused metadata.

```js
api.settings.registerSection({
  id: 'com.example.deep-plugin.settings',
  title: 'Deep Plugin',
  description: 'Plugin-owned controls.',
  section: 'editor',
  fields: [
    { id: 'enabled', label: 'Enabled', type: 'boolean', value: true }
  ]
})
```

Valid built-in targets are `appearance`, `editor`, `vaults`, `addons`, `sync`, `ai`, `sites` and `import`.

A contribution may alternatively define `render(container, context)` for arbitrary controls. It is mounted only in the requested category and removed on category change or addon disable.

## Stable API

The trusted API exposes registration helpers for:

- commands;
- workspace views and sidebar entries;
- targeted settings sections and pages;
- editor extensions, block types, inline types, input rules, toolbar items and paste handlers;
- Markdown post-processors, code block processors and embed renderers;
- layout items and zones;
- status bar items;
- styles, events, mutation observers and DOM mounts;
- Vue components, directives and provides;
- routes and navigation guards;
- resources, hooks and reversible patches.

Resources registered through these helpers are cleaned up automatically when the addon is disabled.

## Experimental API

`api.experimental` exposes raw renderer internals:

```js
api.experimental.window
api.experimental.document
api.experimental.tauri
api.experimental.router
api.experimental.pinia
api.experimental.services
api.experimental.vueApp
api.experimental.host
api.experimental.rawContext
```

This namespace exists so addons can change behavior beyond the stable API. It may change between ElephantNote releases and should be used only when no stable helper is sufficient.

## Trusted Workspace Lab

The reference addon is bundled with the application catalogue. Open **Settings → Addons**, refresh the catalogue and install **Trusted Workspace Lab**. No manually downloaded `.enaddon` is required.

It exercises:

- package installation through the real Rust validator;
- hash-bound Full app access approval;
- global style injection;
- a real command and sidebar entry;
- a visible addon-owned Settings section;
- editor and layout contributions;
- host resource publication;
- complete cleanup on disable.

## Security expectations

The permissions shown for a full app access addon are descriptive, not a strict security boundary. Code running in the renderer can bypass capability wrappers by using the raw application context and Tauri bridge.

Only enable a full app access addon when you trust:

- its publisher;
- its source repository;
- its dependencies;
- the exact package version being installed.

Publisher signatures remain a future hardening increment. Hash-bound approval, emergency safe mode and interrupted-activation crash recovery are implemented now.
