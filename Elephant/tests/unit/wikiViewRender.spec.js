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

const createVault = () => ({
  id: 'vault-1',
  name: 'Vault 1',
  path: '/tmp/vault-1'
})

const getDirectoryCallPath = (call = []) => typeof call[0] === 'string' ? call[0] : call[0]?.relativePath || ''

const expectDirectoryPath = (relativePath) => {
  expect(listDirectory.mock.calls.some((call) => getDirectoryCallPath(call) === relativePath)).toBe(true)
}

const expectLastDirectoryPath = (relativePath) => {
  expect(getDirectoryCallPath(listDirectory.mock.calls.at(-1))).toBe(relativePath)
}

describe('WikiView library root', () => {
  beforeEach(() => {
    listDirectory.mockReset()
    window.localStorage.clear()
    window.tauri = {
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

    expectDirectoryPath('.elephantnote/wiki')
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster.md'])
    expect(container.querySelector('.en-library-grid')).not.toBeNull()
    expect(container.textContent).toContain('Cluster')

    app.unmount()
    container.remove()
  })

  it('clears stale normal-note entries before the wiki root load resolves', async() => {
    const deferred = createDeferred()
    listDirectory.mockReturnValueOnce(deferred.promise)

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
      entries: [
        {
          kind: 'note',
          path: 'Normal.md',
          title: 'Normal',
          tags: [],
          updatedAt: '2026-06-24T06:59:00.000Z'
        }
      ]
    })

    const app = createApp({ render: () => h(WikiView) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await nextTick()

    expectDirectoryPath('.elephantnote/wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries).toEqual([])
    expect(container.textContent).not.toContain('Normal')

    deferred.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Root.md',
        title: 'Root',
        tags: [],
        updatedAt: '2026-06-24T07:03:00.000Z'
      }
    ])
    await flush()

    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Root.md'])

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

    expectLastDirectoryPath('.elephantnote/wiki/Cluster')
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster/Index.md'])

    app.unmount()
    container.remove()
  })

  it('clears stale wiki root entries before a wiki folder load resolves', async() => {
    const deferred = createDeferred()
    listDirectory
      .mockResolvedValueOnce([
        {
          kind: 'folder',
          path: '.elephantnote/wiki/Cluster',
          title: 'Cluster',
          tags: [],
          noteCount: 1,
          updatedAt: '2026-06-24T07:00:00.000Z'
        },
        {
          kind: 'note',
          path: '.elephantnote/wiki/StaleRoot.md',
          title: 'StaleRoot',
          tags: [],
          updatedAt: '2026-06-24T07:00:00.000Z'
        }
      ])
      .mockReturnValueOnce(deferred.promise)

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

    expectLastDirectoryPath('.elephantnote/wiki/Cluster')
    expect(store.currentPath).toBe('.elephantnote/wiki/Cluster')
    expect(store.entries).toEqual([])
    expect(container.textContent).not.toContain('StaleRoot')

    deferred.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Index.md',
        title: 'Index',
        tags: [],
        updatedAt: '2026-06-24T07:01:00.000Z'
      }
    ])
    await flush()

    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Cluster/Index.md'])

    app.unmount()
    container.remove()
  })

  it('resets an already-open wiki subfolder to the wiki root from the rail button', async() => {
    listDirectory.mockResolvedValueOnce([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Root.md',
        title: 'Root',
        tags: [],
        updatedAt: '2026-06-24T07:02:00.000Z'
      }
    ])

    const { useVaultStore } = await import('../../front/app/stores/vaultStore.js')
    const IconRail = (await import('../../front/app/components/navigation/IconRail.vue')).default
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
    store.activeWorkspaceView = 'wiki'
    store.currentPath = '.elephantnote/wiki/Cluster'

    const app = createApp({ render: () => h(IconRail) })
    app.use(pinia)
    const container = document.createElement('div')
    document.body.appendChild(container)
    app.mount(container)
    await flush()

    container.querySelector('button[title="Wiki"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expectDirectoryPath('.elephantnote/wiki')
    expect(store.activeWorkspaceView).toBe('wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Root.md'])

    app.unmount()
    container.remove()
  })

  it('clears stale subfolder entries immediately when the rail button resets to wiki root', async() => {
    const deferred = createDeferred()
    listDirectory.mockReturnValueOnce(deferred.promise)

    const { useVaultStore } = await import('../../front/app/stores/vaultStore.js')
    const IconRail = (await import('../../front/app/components/navigation/IconRail.vue')).default
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
    store.activeWorkspaceView = 'wiki'
    store.currentPath = '.elephantnote/wiki/Cluster'
    store.entries = [
      {
        kind: 'note',
        path: '.elephantnote/wiki/Cluster/Stale.md',
        title: 'Stale',
        tags: [],
        updatedAt: '2026-06-24T07:03:00.000Z'
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

    expectDirectoryPath('.elephantnote/wiki')
    expect(store.currentPath).toBe('.elephantnote/wiki')
    expect(store.entries).toEqual([])

    deferred.resolve([
      {
        kind: 'note',
        path: '.elephantnote/wiki/Root.md',
        title: 'Root',
        tags: [],
        updatedAt: '2026-06-24T07:04:00.000Z'
      }
    ])
    await flush()

    expect(store.entries.map((entry) => entry.path)).toEqual(['.elephantnote/wiki/Root.md'])

    app.unmount()
    container.remove()
  })
})
