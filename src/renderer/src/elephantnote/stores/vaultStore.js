import { defineStore } from 'pinia'
import {
  elephantnoteClient,
  isElephantNoteApiAvailable
} from '../services/elephantnoteClient'

const getPinnedNotesStorageKey = (vault) => {
  const scope = vault?.id || vault?.path || 'default'
  return `elephantnote:pinnedNotes:${scope}`
}

const readPinnedNotePaths = (key) => {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((path) => typeof path === 'string' && path) : []
  } catch {
    return []
  }
}

const writePinnedNotePaths = (key, paths) => {
  window.localStorage.setItem(key, JSON.stringify(paths))
}

const replacePathPrefix = (pathname, oldPath, newPath) => {
  if (!pathname || !oldPath || !newPath) return pathname
  if (pathname === oldPath) return newPath
  if (pathname.startsWith(`${oldPath}/`)) {
    return `${newPath}${pathname.slice(oldPath.length)}`
  }
  return pathname
}

const removePathsByPrefix = (paths, targetPath) => {
  return paths.filter((pathname) => {
    if (!pathname) return false
    return pathname !== targetPath && !pathname.startsWith(`${targetPath}/`)
  })
}

const getRenamedRelativePath = (oldPath, title) => {
  const parts = String(oldPath || '').split('/').filter(Boolean)
  if (parts.length <= 1) return title
  return [...parts.slice(0, -1), title].join('/')
}

const getSidebarItems = (workspace) => workspace?.sidebar || []

const isAttachedSidebarEntry = (item) => item?.type === 'note' || item?.type === 'folder'

export const useVaultStore = defineStore('elephantnoteVaults', {
  state: () => ({
    vaults: [],
    activeVaultId: null,
    activeVault: null,
    workspace: null,
    entries: [],
    rootEntries: [],
    currentPath: '',
    activeWorkspaceView: 'notes',
    filter: 'all',
    sort: 'updated-newest',
    viewMode: 'grid',
    loading: false,
    error: '',
    openedNotePath: '',
    openedNotes: [],
    pinnedNotePaths: []
  }),

  getters: {
    hasVault: (state) => !!state.activeVault,
    activeEntries(state) {
      let entries = [...state.entries]
      const pinned = new Set(state.pinnedNotePaths)
      entries.sort((a, b) => {
        const aPinned = pinned.has(a.path)
        const bPinned = pinned.has(b.path)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        if (state.sort === 'updated-oldest') {
          return new Date(a.updatedAt) - new Date(b.updatedAt)
        }
        if (state.sort === 'title') {
          return a.title.localeCompare(b.title)
        }
        return new Date(b.updatedAt) - new Date(a.updatedAt)
      })
      return entries
    },
    activeNoteEntries() {
      return this.activeEntries.filter((entry) => entry.kind === 'note' || entry.type === 'note')
    },
    rootSidebarEntries(state) {
      const pinned = new Set(state.pinnedNotePaths)
      return [...state.rootEntries].sort((a, b) => {
        const aPinned = pinned.has(a.path)
        const bPinned = pinned.has(b.path)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        if ((a.kind || a.type) !== (b.kind || b.type)) {
          return (a.kind || a.type) === 'folder' ? -1 : 1
        }
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
    },
    workspaceStats(state) {
      const notes = state.rootEntries.filter((entry) => entry.kind === 'note' || entry.type === 'note')
      const folders = state.rootEntries.filter((entry) => entry.kind === 'folder' || entry.type === 'folder')
      const tags = new Set()
      for (const note of notes) {
        for (const tag of note.tags || []) {
          if (tag) tags.add(tag)
        }
      }
      return {
        notes: notes.length,
        folders: folders.length,
        tags: tags.size,
        recent: this.recentNoteEntries.length
      }
    },
    tagTopics(state) {
      const byTag = new Map()
      const notes = state.rootEntries.filter((entry) => entry.kind === 'note' || entry.type === 'note')
      for (const note of notes) {
        for (const tag of note.tags || []) {
          if (!tag) continue
          const topic = byTag.get(tag) || {
            tag,
            notes: [],
            updatedAt: note.updatedAt || ''
          }
          topic.notes.push(note)
          if (new Date(note.updatedAt || 0) > new Date(topic.updatedAt || 0)) {
            topic.updatedAt = note.updatedAt
          }
          byTag.set(tag, topic)
        }
      }
      return [...byTag.values()].sort((a, b) => {
        if (b.notes.length !== a.notes.length) return b.notes.length - a.notes.length
        return a.tag.localeCompare(b.tag)
      })
    },
    calendarBuckets(state) {
      const buckets = new Map()
      const notes = state.rootEntries.filter((entry) => entry.kind === 'note' || entry.type === 'note')
      for (const note of notes) {
        const day = String(note.updatedAt || '').slice(0, 10) || 'No date'
        const bucket = buckets.get(day) || []
        bucket.push(note)
        buckets.set(day, bucket)
      }
      return [...buckets.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, notes]) => ({
          date,
          notes: notes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        }))
    },
    graphModel(state) {
      const notes = state.rootEntries.filter((entry) => entry.kind === 'note' || entry.type === 'note')
      const folders = state.rootEntries.filter((entry) => entry.kind === 'folder' || entry.type === 'folder')
      const nodes = [
        ...folders.map((folder) => ({
          id: folder.path,
          title: folder.title,
          kind: 'folder'
        })),
        ...notes.map((note) => ({
          id: note.path,
          title: note.title,
          kind: 'note'
        }))
      ]
      const edges = []
      for (const note of notes) {
        const folderPath = note.path?.includes('/') ? note.path.split('/').slice(0, -1).join('/') : ''
        if (folderPath && folders.some((folder) => folder.path === folderPath)) {
          edges.push({ source: folderPath, target: note.path, reason: 'folder' })
        }
      }
      for (const topic of this.tagTopics) {
        const taggedNotes = topic.notes
        for (let index = 1; index < taggedNotes.length; index += 1) {
          edges.push({
            source: taggedNotes[0].path,
            target: taggedNotes[index].path,
            reason: `#${topic.tag}`
          })
        }
      }
      return { nodes, edges }
    },
    recentNoteEntries(state) {
      const opened = state.openedNotes.filter((note) => note?.path)
      const modified = state.entries
        .filter((entry) => entry.kind === 'note')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      const byPath = new Map()
      for (const note of [...opened, ...modified]) {
        if (!byPath.has(note.path)) byPath.set(note.path, note)
      }
      const pinned = new Set(state.pinnedNotePaths)
      return [...byPath.values()]
        .sort((a, b) => {
          const aPinned = pinned.has(a.path)
          const bPinned = pinned.has(b.path)
          if (aPinned !== bPinned) return aPinned ? -1 : 1
          return new Date(b.updatedAt) - new Date(a.updatedAt)
        })
        .slice(0, 8)
    },
    sidebarItems(state) {
      return getSidebarItems(state.workspace)
    },
    sidebarAttachedItems() {
      return this.sidebarItems.filter(isAttachedSidebarEntry)
    }
  },

  actions: {
    loadPinnedNotes() {
      this.pinnedNotePaths = readPinnedNotePaths(getPinnedNotesStorageKey(this.activeVault))
    },

    persistPinnedNotes() {
      writePinnedNotePaths(getPinnedNotesStorageKey(this.activeVault), this.pinnedNotePaths)
    },

    isEntryPinned(pathname) {
      return this.pinnedNotePaths.includes(pathname)
    },

    isNotePinned(pathname) {
      return this.isEntryPinned(pathname)
    },

    togglePinnedEntry(pathname) {
      if (!pathname) return false
      const index = this.pinnedNotePaths.indexOf(pathname)
      if (index === -1) {
        this.pinnedNotePaths = [pathname, ...this.pinnedNotePaths]
      } else {
        this.pinnedNotePaths = [
          ...this.pinnedNotePaths.slice(0, index),
          ...this.pinnedNotePaths.slice(index + 1)
        ]
      }
      this.persistPinnedNotes()
      return this.isEntryPinned(pathname)
    },

    togglePinnedNote(pathname) {
      return this.togglePinnedEntry(pathname)
    },

    isEntryVisibleInSidebar(pathname) {
      return !!pathname && this.sidebarAttachedItems.some((item) => item.path === pathname)
    },

    isFolderVisibleInSidebar(pathname) {
      return this.isEntryVisibleInSidebar(pathname)
    },

    async attachEntryToSidebar(entry) {
      if (!entry?.path) return false
      if (this.isEntryVisibleInSidebar(entry.path)) return true
      const payload = {
        relativePath: entry.path,
        title: entry.title || entry.filename?.replace(/\.md$/i, '') || entry.path.split('/').pop(),
        type: entry.kind || entry.type
      }
      const result = await elephantnoteClient.sidebar.attach(payload)
      this.workspace = result.workspace
      return true
    },

    async detachEntryFromSidebar(pathname) {
      if (!pathname) return false
      const result = await elephantnoteClient.sidebar.detach(pathname)
      this.workspace = result.workspace
      return true
    },

    async toggleEntrySidebarVisibility(entry) {
      if (!entry?.path) return false
      if (this.isEntryVisibleInSidebar(entry.path)) {
        await this.detachEntryFromSidebar(entry.path)
        return false
      }
      await this.attachEntryToSidebar(entry)
      return true
    },

    applyPayload(payload) {
      if (!payload || payload.canceled) return
      this.vaults = payload.vaults || []
      this.activeVaultId = payload.activeVaultId || null
      this.activeVault = payload.activeVault || null
      this.workspace = payload.workspace || null
      this.entries = payload.entries || []
      this.rootEntries = payload.entries || []
      this.openedNotePath = ''
      this.openedNotes = []
      this.currentPath = ''
      this.activeWorkspaceView = 'notes'
      this.loadPinnedNotes()
      if (this.activeVault?.path && isElephantNoteApiAvailable()) {
        elephantnoteClient.search.initVault(this.activeVault.path).catch((err) => {
          console.warn('Unable to initialize search:', err)
        })
      }
    },

    async load() {
      this.loading = true
      this.error = ''
      try {
        this.applyPayload(await elephantnoteClient.vaults.get())
      } catch (err) {
        this.error = err.message || 'Unable to load vaults.'
      } finally {
        this.loading = false
      }
    },

    async chooseVault() {
      this.loading = true
      this.error = ''
      try {
        this.applyPayload(await elephantnoteClient.vaults.select())
        this.currentPath = ''
      } catch (err) {
        this.error = err.message || 'Unable to choose vault.'
      } finally {
        this.loading = false
      }
    },

    async setActiveVault(vaultId) {
      this.loading = true
      this.error = ''
      try {
        this.applyPayload(await elephantnoteClient.vaults.setActive(vaultId))
        this.currentPath = ''
      } catch (err) {
        this.error = err.message || 'Unable to switch vault.'
      } finally {
        this.loading = false
      }
    },

    async openDirectory(relativePath = '') {
      this.currentPath = relativePath
      this.openedNotePath = ''
      this.activeWorkspaceView = 'notes'
      const entries = await elephantnoteClient.directory.list(relativePath)
      this.entries = entries
      if (!relativePath) {
        this.rootEntries = entries
      }
    },

    async refreshSavedNote(pathname) {
      if (!this.activeVault?.path || !pathname) return

      const relativePath = window.path.relative(this.activeVault.path, pathname)
      if (!relativePath || relativePath.startsWith('..') || window.path.isAbsolute(relativePath)) return

      const parentPath = window.path.dirname(relativePath)
      const directoryPath = parentPath === '.' ? '' : parentPath
      const entries = await elephantnoteClient.directory.list(directoryPath)
      const savedEntry = entries.find((entry) => entry.path === relativePath)

      if (directoryPath === this.currentPath) {
        this.entries = entries
      }
      if (savedEntry) {
        this.rememberNote(savedEntry)
      }
    },

    rememberNote(entry) {
      if (!entry?.path) return
      this.openedNotes = [
        {
          path: entry.path,
          title: entry.title || entry.path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
          kind: 'note',
          type: entry.type || 'note',
          updatedAt: entry.updatedAt || new Date().toISOString()
        },
        ...this.openedNotes.filter((note) => note.path !== entry.path)
      ].slice(0, 8)
    },

    updateNoteMetadata(pathname, metadata = {}) {
      if (!pathname) return
      const applyMetadata = (entry) => {
        if (!entry || entry.path !== pathname) return entry
        return {
          ...entry,
          title: metadata.title || entry.title,
          tags: Array.isArray(metadata.tags) ? metadata.tags : entry.tags,
          updatedAt: metadata.updatedAt || entry.updatedAt
        }
      }
      this.entries = this.entries.map(applyMetadata)
      this.openedNotes = this.openedNotes.map(applyMetadata)
    },

    openNote(entry) {
      if (this.openedNotePath === entry.path) return
      this.openedNotePath = entry.path
      this.rememberNote(entry)
      window.electron.ipcRenderer.send('mt::open-file', `${this.activeVault.path}/${entry.path}`, {})
    },

    closeNote() {
      this.openedNotePath = ''
    },

    setWorkspaceView(view) {
      this.activeWorkspaceView = ['notes', 'dashboard', 'wiki', 'graph', 'calendar'].includes(view)
        ? view
        : 'notes'
      this.openedNotePath = ''
    },

    async createNote() {
      const result = await elephantnoteClient.notes.create(this.currentPath)
      this.entries = result.entries
      if (!this.currentPath) {
        this.rootEntries = result.entries
      }
      this.openedNotePath = result.note.path
      this.rememberNote(result.note)
      window.electron.ipcRenderer.send('mt::open-file', result.note.fullPath, {})
    },

    async createFolder() {
      const result = await elephantnoteClient.folders.create(this.currentPath)
      this.entries = result.entries
      if (!this.currentPath) {
        this.rootEntries = result.entries
      }
    },

    async renameEntry(entry, title) {
      const oldPath = entry?.path
      const result = await elephantnoteClient.entries.rename({
        relativePath: entry.path,
        title
      })
      this.workspace = result.workspace
      this.entries = result.entries
      if (!this.currentPath) {
        this.rootEntries = result.entries
      }
      if (oldPath) {
        const nextPath = getRenamedRelativePath(oldPath, title)
        this.pinnedNotePaths = this.pinnedNotePaths.map((pathname) => replacePathPrefix(pathname, oldPath, nextPath))
        this.currentPath = replacePathPrefix(this.currentPath, oldPath, nextPath)
        this.openedNotePath = replacePathPrefix(this.openedNotePath, oldPath, nextPath)
        this.persistPinnedNotes()
      }
      if (this.openedNotePath === entry.path) this.closeNote()
    },

    async deleteEntry(entry) {
      const oldPath = entry?.path
      const result = await elephantnoteClient.entries.delete(entry.path)
      this.workspace = result.workspace
      this.entries = result.entries
      if (!this.currentPath) {
        this.rootEntries = result.entries
      }
      if (oldPath) {
        this.pinnedNotePaths = removePathsByPrefix(this.pinnedNotePaths, oldPath)
        this.currentPath = removePathsByPrefix([this.currentPath], oldPath)[0] || ''
        this.openedNotePath = removePathsByPrefix([this.openedNotePath], oldPath)[0] || ''
        this.persistPinnedNotes()
      }
      if (this.openedNotePath === entry.path) this.closeNote()
    },

    notifyAiUnavailable() {
      window.electron.ipcRenderer.send('mt::show-notification', {
        title: 'AI features are not available yet.',
        type: 'info'
      })
    },

    openSettings() {
      window.electron.ipcRenderer.send('mt::open-setting-window')
    }
  }
})
