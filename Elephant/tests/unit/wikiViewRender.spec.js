import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const { listDirectory } = vi.hoisted(() => ({
  listDirectory: vi.fn()
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('electron-log/renderer', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('../../front/app/services/elephantnoteClient', () => ({
  elephantnoteClient: {
    directory: {
      list: listDirectory
    }
  }
}))

const flush = async() => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

const createVault = () => ({
  id: 'vault-1',
  name: 'Vault 1',
  path: '/tmp/vault-1'
})

describe('WikiView library root', () => {
  beforeEach(() => {
    listDirectory.mockReset()
    window.localStorage.clear()
    window.electron = {
      ipcRenderer: {
        send: vi.fn()
      }
    }
    setActivePinia(createPinia())
  })

  it('renders the shared all-notes library grid on the hidden wiki root', async() => {
    listDirectory.mockResolvedValueOnce([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster.md',
        title: 'Cluster',
        tags: [],
        updatedAt: '2026-06-24T07:00:00.000Z'
      }
    ])

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
      entries: []
    })

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    expect(listDirectory).toHaveBeenCalledWith('.elephantnote/wiki')
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster.md'])
    expect(container.querySelector('.en-library-grid')).not.toBeNull()
    expect(container.textContent).toContain('Cluster')

    app.unmount()
    container.remove()
  })

  it('keeps the wiki view empty when the wiki root does not exist yet', async() => {
    listDirectory.mockRejectedValueOnce(new Error('ENOENT: no wiki directory'))

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
      entries: []
    })

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries).toEqual([])
    expect(container.textContent).not.toContain('No wiki notes yet')

    app.unmount()
    container.remove()
  })

  it('opens wiki folders without switching back to normal notes', async() => {
    listDirectory
      .mockResolvedValueOnce([
        {
          kind: 'folder',
          path: '.elephantnote/wiki/Cluster',
          title: 'Cluster',
          tags: [],
          noteCount: 1,
          updatedAt: '2026-06-24T07:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          kind: 'note',
          path: '.elephantnote/wiki/Cluster/Index.md',
          title: 'Index',
          tags: [],
          updatedAt: '2026-06-24T07:01:00.000Z'
        }
      ])

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
      entries: []
    })

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    container.querySelector('.en-note-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(listDirectory).toHaveBeenLastCalledWith('.elephantnote/wiki/Cluster')
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster/Index.md'])

    app.unmount()
    container.remove()
  })
})
