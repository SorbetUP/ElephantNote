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

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

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

const seedVault = async (entries = []) => {
  const { useVaultStore } = await import('../../front/app/stores/vaultStore.js')
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
  return { pinia, store }
}

describe('wiki async navigation races', () => {
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

  it('ignores a stale wiki root response after the current path changes', async() => {
    const rootLoad = createDeferred()
    listDirectory.mockReturnValueOnce(rootLoad.promise)

    const WikiView = (await import('../../front/app/components/views/WikiView.vue')).default
    const { pinia, store } = await seedVault([])

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await nextTick()

    store.currentPath = '.elephantnote/wiki/Cluster'
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Index.md',
        title: 'Index',
        tags: [],
        updatedAt: '2026-06-24T07:10:00.000Z'
      }
    ]

    rootLoad.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Root.md',
        title: 'Root',
        tags: [],
        updatedAt: '2026-06-24T07:11:00.000Z'
      }
    ])
    await flush()

    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster/Index.md'])

    app.unmount()
    container.remove()
  })

  it('ignores a stale wiki folder response after another wiki path becomes active', async() => {
    const folderLoad = createDeferred()
    listDirectory
      .mockResolvedValueOnce([
        {
          kind: 'folder',
          path: '.elephantnote/wiki/Cluster',
          title: 'Cluster',
          tags: [],
          noteCount: 1,
          updatedAt: '2026-06-24T07:12:00.000Z'
        }
      ])
      .mockReturnValueOnce(folderLoad.promise)

    const WikiView = (await import('../../front/app/components/views/WikiView.vue')).default
    const { pinia, store } = await seedVault([])

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    container.querySelector('.en-note-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries).toEqual([])

    store.currentPath = '.elephantnote/wiki/Other'
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Other/Index.md',
        title: 'Other Index',
        tags: [],
        updatedAt: '2026-06-24T07:13:00.000Z'
      }
    ]

    folderLoad.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Index.md',
        title: 'Cluster Index',
        tags: [],
        updatedAt: '2026-06-24T07:14:00.000Z'
      }
    ])
    await flush()

    expect(store.currentPath).toBe('.elephantnote/wiki/Other')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Other/Index.md'])

    app.unmount()
    container.remove()
  })

  it('ignores a stale rail wiki-root response after another wiki path becomes active', async() => {
    const rootLoad = createDeferred()
    listDirectory.mockReturnValueOnce(rootLoad.promise)

    const IconRail = (await import('../../front/app/components/navigation/IconRail.vue')).default
    const { pinia, store } = await seedVault([])
    store.activeWorkspaceView = 'wiki'
    store.currentPath = '.elephantnote/wiki/Cluster'
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Stale.md',
        title: 'Stale',
        tags: [],
        updatedAt: '2026-06-24T07:15:00.000Z'
      }
    ]

    const app = createApp({ render: () => h(IconRail) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    container.querySelector('button[title="Wiki"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries).toEqual([])

    store.currentPath = '.elephantnote/wiki/Other'
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Other/Index.md',
        title: 'Other Index',
        tags: [],
        updatedAt: '2026-06-24T07:16:00.000Z'
      }
    ]

    rootLoad.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Root.md',
        title: 'Root',
        tags: [],
        updatedAt: '2026-06-24T07:17:00.000Z'
      }
    ])
    await flush()

    expect(store.currentPath).toBe('.elephantnote/wiki/Other')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Other/Index.md'])

    app.unmount()
    container.remove()
  })
})
