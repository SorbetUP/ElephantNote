# Trusted Workspace Lab

Reference addon for ElephantNote's **Full app access** runtime.

It deliberately demonstrates capabilities that are impossible in the isolated Worker runtime:

- inject global CSS into ElephantNote;
- modify the root DOM directly;
- register workspace, settings, editor and layout contributions;
- access the Vue application, router, Pinia and application services through the trusted API;
- receive automatic cleanup when the addon is disabled.

## Package

```bash
node build/scripts/package-addon.mjs \
  examples/addons/trusted-workspace-lab \
  build/addons/trusted-workspace-lab.enaddon
```

Install the package from **Settings → Addons → Install from file**. Enabling it opens a separate consent surface explaining that the addon runs inside ElephantNote and is not sandboxed.

Approval is bound to the exact package hash. Rebuilding or updating the package requires approval again.

## Contract

The entry file is a single ESM module exporting either:

```js
export default {
  async onload(api) {},
  async onunload(api) {}
}
```

or a class with the same lifecycle methods.

Full app access addons are expected to use the registration helpers whenever possible so ElephantNote can automatically remove commands, views, listeners and styles during deactivation. The `experimental` namespace exposes unstable internals for deeper integrations and can break between releases.
