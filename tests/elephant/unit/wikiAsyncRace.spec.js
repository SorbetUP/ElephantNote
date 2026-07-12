import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const { listDirectory } = vi.hoisted(() => ({
  listDirectory: vi.fn()
}))

vi.mock('../../front/app/services/elephantnoteClient', () => ({
  elephantnoteClient: {
    directory: { list: listDirectory },
    features: { get: vi.fn().mockResolvedValue({ askAi: true }) }
  }
}))

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

describe('wiki asynchronous state isolation', () => {
  beforeEach(() => {
    listDirectory.mockReset()
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

  it('does not start obsolete hidden-directory requests on mount', async() => {
    const { app, container, store } = await mountWiki()

    expect(listDirectory).not.toHaveBeenCalled()
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('')
    expect(store.entries).toEqual([])

    app.unmount()
    container.remove()
  })

  it('discards stale wiki state when a later vault change arrives', async() => {
    const { app, container, store } = await mountWiki()
    store.currentPath = 'stale/path'
    store.entries = [{ kind: 'note', path: 'stale/path/Note.md', title: 'Stale' }]

    store.activeVaultId = 'vault-2'
    store.activeVault = createVault('vault-2')
    await nextTick()

    expect(store.currentPath).toBe('')
    expect(store.entries).toEqual([])
    expect(store.activeWorkspaceView).toBe('wiki')

    app.unmount()
    container.remove()
  })
})
