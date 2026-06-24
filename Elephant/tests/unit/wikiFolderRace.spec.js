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
    },
    features: {
      get: vi.fn().mockResolvedValue({ askAi: true })
    }
  }
}))

const flush = async() => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createVault = (id = 'vault-1') => ({
  id,
  name: `Vault ${id}`,
  path: `/tmp/${id}`
})

describe('Wiki folder request races', () => {
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

  it('does not apply a folder response after the user leaves the wiki view', async() => {
    const folderLoad = createDeferred()
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
      .mockReturnValueOnce(folderLoad.promise)

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
    await nextTick()

    expect(listDirectory).toHaveBeenLastCalledWith('.elephantnote/wiki/Cluster')
    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries).toEqual([])

    store.activeWorkspaceView = 'notes'
    store.currentPath = ''
    store.entries = [
      {
        kind: 'note',
        path: 'Normal.md',
        title: 'Normal',
        tags: [],
        updatedAt: '2026-06-24T07:02:00.000Z'
      }
    ]

    folderLoad.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Stale.md',
        title: 'Stale',
        tags: [],
        updatedAt: '2026-06-24T07:03:00.000Z'
      }
    ])
    await flush()

    expect(store.activeWorkspaceView).toBe('notes')
    expect(store.currentPath).toBe('')
    expect(store.entries.map((entry) => entry.path)).toEqual(['Normal.md'])

    app.unmount()
    container.remove()
  })

  it('does not apply a folder response after switching vaults', async() => {
    const folderLoad = createDeferred()
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
      .mockReturnValueOnce(folderLoad.promise)

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
    await flush()

    container.querySelector('.en-note-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    store.activeVaultId = 'vault-2'
    store.activeVault = createVault('vault-2')
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Vault2.md',
        title: 'Vault2',
        tags: [],
        updatedAt: '2026-06-24T07:02:00.000Z'
      }
    ]

    folderLoad.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/StaleVault1.md',
        title: 'StaleVault1',
        tags: [],
        updatedAt: '2026-06-24T07:03:00.000Z'
      }
    ])
    await flush()

    expect(store.activeVaultId).toBe('vault-2')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Vault2.md'])

    app.unmount()
    container.remove()
  })
})
