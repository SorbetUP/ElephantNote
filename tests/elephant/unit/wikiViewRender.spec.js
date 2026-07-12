import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const createVault = (id = 'vault-1') => ({
  id,
  name: `Vault ${id}`,
  path: `/tmp/${id}`
})

const mountWiki = async({ entries = [], currentPath = '', openedNotePath = '' } = {}) => {
  const { useVaultStore } = await import('../../front/app/stores/vaultStore.js')
  const WikiView = (await import('../../front/app/components/views/WikiView.vue')).default
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useVaultStore()
  store.applyPayload({
    vaults: [createVault()],
    activeVaultId: 'vault-1',
    activeVault: createVault(),
    workspace: { sidebar: [] },
    entries
  })
  store.currentPath = currentPath
  store.openedNotePath = openedNotePath

  const app = createApp({ render: () => h(WikiView) })
  app.use(pinia)
  const container = document.createElement('div')
  document.body.appendChild(container)
  app.mount(container)
  await nextTick()
  return { app, container, store }
}

describe('WikiView empty-state lifecycle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.tauri = {
      ipcRenderer: {
        send: vi.fn(),
        invoke: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        removeListener: vi.fn()
      }
    }
    setActivePinia(createPinia())
  })

  it('renders the shared wiki surface and clears stale note state on mount', async() => {
    const { app, container, store } = await mountWiki({
      currentPath: 'Projects',
      openedNotePath: 'Projects/Stale.md',
      entries: [{ kind: 'note', path: 'Projects/Stale.md', title: 'Stale' }]
    })

    expect(container.querySelector('.en-wiki-library')).not.toBeNull()
    expect(container.querySelector('.en-library-grid')).not.toBeNull()
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('')
    expect(store.openedNotePath).toBe('')
    expect(store.entries).toEqual([])
    expect(container.textContent).not.toContain('Stale')

    app.unmount()
    container.remove()
  })

  it('resets the wiki surface when the active vault changes', async() => {
    const { app, container, store } = await mountWiki()
    store.currentPath = 'Temporary'
    store.openedNotePath = 'Temporary/Note.md'
    store.entries = [{ kind: 'note', path: 'Temporary/Note.md', title: 'Temporary' }]

    store.activeVaultId = 'vault-2'
    await nextTick()

    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('')
    expect(store.openedNotePath).toBe('')
    expect(store.entries).toEqual([])

    app.unmount()
    container.remove()
  })
})
