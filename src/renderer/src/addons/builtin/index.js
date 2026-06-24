export const addonInspectorAddon = {
  manifest: {
    id: 'elephant.addon-inspector',
    name: 'Addon Inspector',
    version: '0.1.0',
    description: 'Developer helper that exposes sample addon contributions.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: [],
    contributes: {
      settings: true,
      actions: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.addon-inspector.open',
      title: 'Open Addon Inspector',
      description: 'Open the Addons settings page.',
      run: () => ctx.router?.push?.('/preference/addons')
    })

    ctx.addSettingsSection({
      id: 'elephant.addon-inspector.settings',
      title: 'Addon Inspector',
      description: 'Sample settings section registered through the addon system.'
    })
  }
}

export const builtinAddons = [addonInspectorAddon]
