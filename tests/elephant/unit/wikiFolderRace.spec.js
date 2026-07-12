import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const createVault = (id = 'vault-1') => ({
  id,
  name: `Vault ${id}`,
  path: `/tmp/${id}`
})

const mountWiki = async() => {
  const { useVaultStore } = await import('../../front/app/stores/vaultStore.js')
  const WikiView = (await import('../../front/app/components/views/WikiView.vue')).default
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useVaultStore()
  store.applyPayload({
    vaults: [createVault('vault-1'), createVault('vault-2')],
    activeVaultId: 'vault-1',
    activeVault: createVault('vault-1'),
    workspace: { sidebar: [] },
    entries: []
  })

  const app = createApp({ render: () => h(WikiView) })
  app.use(pinia)
  const container = document.createElement('div')
  document.body.appendChild(container)
  app.mount(container)
  await nextTick()
  return { app, container, store }
}

describe('Wiki view lifecycle boundaries', () => {
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

  it('does not overwrite another workspace after the user leaves the mounted wiki view', async() => {
    const { app, container, store } = await mountWiki()

    store.activeWorkspaceView = 'notes'
    store.currentPath = 'Projects'
    store.entries = [{ kind: 'note', path: 'Projects/Note.md', title: 'Note' }]
    await nextTick()

    expect(store.activeWorkspaceView).toBe('notes')
    expect(store.currentPath).toBe('Projects')
    expect(store.entries.map((entry) => entry.path)).toEqual(['Projects/Note.md'])

    app.unmount()
    container.remove()
  })

  it('resets stale state when the active vault changes', async() => {
    const { app, container, store } = await mountWiki()
    store.currentPath = 'OldVault'
    store.openedNotePath = 'OldVault/Note.md'
    store.entries = [{ kind: 'note', path: 'OldVault/Note.md', title: 'Old' }]

    store.activeVaultId = 'vault-2'
    store.activeVault = createVault('vault-2')
    await nextTick()

    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('')
    expect(store.openedNotePath).toBe('')
    expect(store.entries).toEqual([])

    app.unmount()
    container.remove()
  })
})
