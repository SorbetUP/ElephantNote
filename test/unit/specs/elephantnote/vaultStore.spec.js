import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVaultStore } from '@/elephantnote/stores/vaultStore'

const createVault = (id = 'vault-1', path = '/tmp/vault-1') => ({ id, path, name: 'Vault 1' })

describe('ElephantNote vault store pinned notes', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    window.elephantnote = window.elephantnote || {}
    window.elephantnote.attachSidebarEntry = async(payload) => ({
      workspace: {
        sidebar: [
          {
            id: `sidebar-${payload.relativePath}`,
            path: payload.relativePath,
            title: payload.title,
            type: payload.type
          }
        ]
      },
      entries: []
    })
    window.elephantnote.detachSidebarEntry = async() => ({
      workspace: { sidebar: [] },
      entries: []
    })
  })

  it('loads pinned notes for the active vault when payloads are applied', () => {
    window.localStorage.setItem(
      'elephantnote:pinnedNotes:vault-1',
      JSON.stringify(['notes/pinned.md'])
    )

    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: []
    })

    expect(store.pinnedNotePaths).toEqual(['notes/pinned.md'])
    expect(store.isNotePinned('notes/pinned.md')).toBe(true)
  })

  it('toggles pinned notes and persists them per vault', () => {
    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: []
    })

    expect(store.togglePinnedNote('notes/pinned.md')).toBe(true)
    expect(window.localStorage.getItem('elephantnote:pinnedNotes:vault-1'))
      .toBe(JSON.stringify(['notes/pinned.md']))

    expect(store.togglePinnedNote('notes/pinned.md')).toBe(false)
    expect(window.localStorage.getItem('elephantnote:pinnedNotes:vault-1'))
      .toBe(JSON.stringify([]))
  })

  it('keeps pinned notes at the top of the recent notes list', () => {
    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: [
        {
          kind: 'note',
          path: 'notes/fresh.md',
          title: 'Fresh',
          updatedAt: '2026-05-18T11:00:00.000Z'
        },
        {
          kind: 'note',
          path: 'notes/pinned.md',
          title: 'Pinned',
          updatedAt: '2026-05-17T11:00:00.000Z'
        }
      ]
    })

    store.togglePinnedNote('notes/pinned.md')

    expect(store.recentNoteEntries.map((note) => note.path)).toEqual([
      'notes/pinned.md',
      'notes/fresh.md'
    ])
  })

  it('keeps pinned entries at the top of the active list', () => {
    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: [
        { kind: 'note', path: 'notes/a.md', title: 'A', updatedAt: '2026-05-18T10:00:00.000Z' },
        { kind: 'folder', path: 'folder-a', title: 'Folder A', updatedAt: '2026-05-19T10:00:00.000Z' }
      ]
    })

    store.togglePinnedEntry('folder-a')

    expect(store.activeEntries.map((entry) => entry.path)).toEqual([
      'folder-a',
      'notes/a.md'
    ])
  })

  it('shows all entries regardless of the filter value', () => {
    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: [
        { kind: 'note', path: 'notes/a.md', title: 'A', updatedAt: '2026-05-18T10:00:00.000Z' },
        { kind: 'folder', path: 'folder-a', title: 'Folder A', updatedAt: '2026-05-17T10:00:00.000Z' }
      ]
    })

    store.filter = 'articles'

    expect(store.activeEntries.map((entry) => entry.path)).toEqual([
      'notes/a.md',
      'folder-a'
    ])
  })

  it('persists folder sidebar visibility in the workspace', async() => {
    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: []
    })

    await expect(store.toggleEntrySidebarVisibility({
      kind: 'folder',
      path: 'folder-a',
      title: 'Folder A'
    })).resolves.toBe(true)
    expect(store.sidebarAttachedItems.map((item) => item.path)).toEqual(['folder-a'])
    await expect(store.toggleEntrySidebarVisibility({
      kind: 'folder',
      path: 'folder-a',
      title: 'Folder A'
    })).resolves.toBe(false)
    expect(store.sidebarAttachedItems).toEqual([])
  })

  it('updates pinned folders when a folder is renamed', async() => {
    window.elephantnote.renameEntry = async() => ({
      workspace: {
        sidebar: [
          {
            id: 'sidebar-renamed',
            path: 'Getting Started/Renamed',
            title: 'Renamed',
            type: 'folder'
          }
        ]
      },
      entries: []
    })

    const store = useVaultStore()
    store.applyPayload({
      vaults: [createVault()],
      activeVaultId: 'vault-1',
      activeVault: createVault(),
      workspace: { sidebar: [] },
      entries: []
    })

    await store.attachEntryToSidebar({
      kind: 'folder',
      path: 'Getting Started/New Folder',
      title: 'New Folder'
    })
    store.togglePinnedEntry('Getting Started/New Folder')

    await store.renameEntry({ kind: 'folder', path: 'Getting Started/New Folder' }, 'Renamed')

    expect(store.sidebarAttachedItems.map((item) => item.path)).toEqual(['Getting Started/Renamed'])
    expect(store.pinnedNotePaths).toEqual(['Getting Started/Renamed'])
  })
})
