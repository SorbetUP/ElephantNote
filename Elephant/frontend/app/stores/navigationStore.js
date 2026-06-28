import { defineStore } from 'pinia'
import { createDefaultSyncPlan } from 'common/elephantnote/sync'

const isSameEntry = (a, b) => {
  if (!a || !b) return false
  if (a.type !== b.type) return false
  if (a.id || b.id) return a.id === b.id
  if (a.path || b.path) return a.path === b.path
  return a.type === b.type
}

export const useNavigationStore = defineStore('elephantnoteNavigation', {
  state: () => ({
    history: [],
    index: -1,
    syncStatus: 'idle',
    syncError: ''
  }),

  getters: {
    canGoBack: (state) => state.index > 0,
    canGoForward: (state) => state.index < state.history.length - 1,
    current: (state) => state.history[state.index] || null
  },

  actions: {
    push(entry) {
      if (!entry) return
      const normalized = { ...entry }
      if (this.history.length > 0 && this.index >= 0) {
        if (isSameEntry(this.history[this.index], normalized)) return
        this.history = this.history.slice(0, this.index + 1)
      }
      this.history = [...this.history, normalized]
      this.index = this.history.length - 1
      if (this.history.length > 100) {
        this.history = this.history.slice(-80)
        this.index = this.history.length - 1
      }
    },

    reset(entry) {
      this.history = []
      this.index = -1
      this.push(entry)
    },

    back() {
      if (this.index > 0) {
        this.index -= 1
        return this.history[this.index]
      }
      return null
    },

    forward() {
      if (this.index < this.history.length - 1) {
        this.index += 1
        return this.history[this.index]
      }
      return null
    },

    async syncWorkspace(vaultPath = '') {
      if (this.syncStatus === 'syncing') return
      this.syncStatus = 'syncing'
      this.syncError = ''
      try {
        const { elephantnoteClient } = await import('../services/elephantnoteClient')
        for (const { operation, payload } of createDefaultSyncPlan()) {
          await elephantnoteClient.sync.enqueue(operation, payload)
        }
        await elephantnoteClient.sync.run()
        if (vaultPath) {
          await elephantnoteClient.search.initVault(vaultPath)
          await elephantnoteClient.search.rebuild()
        }
        this.syncStatus = 'synced'
      } catch (error) {
        this.syncStatus = 'error'
        this.syncError = error?.message || 'Sync failed'
        setTimeout(() => {
          if (this.syncStatus === 'error') {
            this.syncStatus = 'idle'
            this.syncError = ''
          }
        }, 4000)
      }
    }
  }
})
