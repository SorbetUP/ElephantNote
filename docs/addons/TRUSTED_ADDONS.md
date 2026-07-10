# Full app access addons

ElephantNote supports two external addon execution models.

## Limited access

Limited access addons run in a dedicated Worker. They receive a small capability API and cannot directly access Vue, Pinia, Muya, the DOM, Tauri or browser networking.

Use this mode for reports, importers, task engines, templates, API clients and other features that can be expressed through the public brokered API.

## Full app access

Full app access addons run as JavaScript modules inside ElephantNote's renderer. They can modify the application deeply, including the editor, workspace, layout and DOM.

A full app access addon can reach:

- the Vue application;
- the router and Pinia stores;
- ElephantNote services;
- the addon manager and all public contribution points;
- the DOM and browser globals;
- the Tauri bridge through the experimental namespace;
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

## Safe mode

**Settings → Addons → Full app access safe mode** stops every running full app access addon and prevents trusted addons from starting automatically.

Safe mode does not:

- uninstall packages;
- delete addon data;
- disable built-in addons;
- disable limited access addons.

This provides a recovery path when a trusted addon breaks the interface or enters a crash loop.

## Stable API

The trusted API exposes registration helpers for:

- commands;
- workspace views and sidebar entries;
- settings sections and pages;
- editor extensions, block types, inline types, input rules, toolbar items and paste handlers;
- Markdown post-processors, code block processors and embed renderers;
- layout items and zones;
- status bar items;
- styles, events and mutation observers.

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
api.experimental.rawContext
```

This namespace exists so addons can change behavior beyond the stable API. It may change between ElephantNote releases and should be used only when no stable contribution point is sufficient.

## Security expectations

The permissions shown for a full app access addon are descriptive, not a strict security boundary. Code running in the renderer can bypass capability wrappers by using the raw application context.

Only enable a full app access addon when you trust:

- its publisher;
- its source repository;
- its dependencies;
- the exact package version being installed.

Publisher signatures, automatic rollback and crash-loop quarantine remain separate future hardening increments. Hash-bound approval and emergency safe mode are implemented now.
