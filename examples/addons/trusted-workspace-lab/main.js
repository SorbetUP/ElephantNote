export default class TrustedWorkspaceLab {
  constructor(api) {
    this.api = api
    this.enabled = false
  }

  async onload(api) {
    this.api = api

    api.ui.registerStyle(`
      html.elephant-trusted-focus .en-sidebar-nav,
      html.elephant-trusted-focus .en-top-vault-bar {
        opacity: 0.22;
        filter: saturate(0.35);
        transition: opacity 160ms ease, filter 160ms ease;
      }

      html.elephant-trusted-focus .en-body-main {
        outline: 2px solid color-mix(in srgb, var(--en-primary, #2563eb) 45%, transparent);
        outline-offset: -2px;
      }
    `, 'focus-mode')

    api.commands.register({
      id: 'com.elephantnote.examples.trusted-workspace-lab.toggle-focus',
      title: 'Toggle trusted focus mode',
      description: 'Modify ElephantNote directly from a full app access addon.',
      run: () => {
        this.enabled = !this.enabled
        api.experimental.document.documentElement.classList.toggle('elephant-trusted-focus', this.enabled)
        return { enabled: this.enabled }
      }
    })

    api.workspace.registerSidebarItem({
      id: 'com.elephantnote.examples.trusted-workspace-lab.sidebar',
      title: 'Trusted Lab',
      tooltip: 'Toggle the trusted focus mode',
      actionId: 'com.elephantnote.examples.trusted-workspace-lab.toggle-focus',
      icon: 'shield-alert',
      order: 980
    })

    api.settings.registerSection({
      id: 'com.elephantnote.examples.trusted-workspace-lab.settings',
      title: 'Trusted Workspace Lab',
      description: 'Reference implementation for full app access addons.',
      order: 980
    })

    api.editor.registerExtension({
      id: 'com.elephantnote.examples.trusted-workspace-lab.editor-extension',
      type: 'trusted-reference',
      description: 'Proves that trusted addons can register editor extensions.'
    })

    api.layout.registerItem({
      id: 'com.elephantnote.examples.trusted-workspace-lab.layout-item',
      title: 'Trusted Lab',
      preferredZone: 'icon-rail',
      order: 980
    })

    api.ui.on(api.experimental.window, 'beforeunload', () => {
      api.experimental.document.documentElement.classList.remove('elephant-trusted-focus')
    })

    api.app.emit('elephantnote:trusted-addon-loaded', {
      addonId: api.manifest.id,
      routerReady: Boolean(api.app.router),
      piniaReady: Boolean(api.app.pinia),
      servicesReady: Boolean(api.app.services)
    })
  }

  async onunload() {
    this.api?.experimental?.document?.documentElement?.classList?.remove('elephant-trusted-focus')
  }
}
