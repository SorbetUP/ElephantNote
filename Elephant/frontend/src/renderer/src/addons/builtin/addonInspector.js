export const addonInspectorAddon = {
  manifest: {
    id: 'elephant.addon-inspector',
    name: 'Addon Inspector',
    version: '0.3.0',
    description: 'Developer helper demonstrating actions, settings and sidebar contributions.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: [],
    contributes: {
      settings: true,
      actions: true,
      sidebar: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.addon-inspector.open',
      title: 'Open Addon Inspector',
      description: 'Open the Addons section in the active settings panel.',
      run: () => {
        globalThis.dispatchEvent?.(new CustomEvent('elephantnote:open-settings', {
          detail: { section: 'addons' }
        }))
        return { section: 'addons' }
      }
    })

    ctx.addSidebarItem({
      id: 'elephant.addon-inspector.rail',
      title: 'Addon Inspector',
      tooltip: 'Open Addon Inspector',
      actionId: 'elephant.addon-inspector.open',
      order: 100
    })

    ctx.addSettingsSection({
      id: 'elephant.addon-inspector.settings',
      title: 'Addon Inspector',
      description: 'Developer-only reference implementation for addon contributions.',
      order: 1000
    })
  }
}
