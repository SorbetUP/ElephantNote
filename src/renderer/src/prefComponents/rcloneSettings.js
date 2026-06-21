import { h } from 'vue'

const copyToClipboard = async(text) => {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text)
    return true
  }
  return false
}

export default {
  name: 'RcloneSettings',
  data: () => ({
    remotePath: '',
    statusLabel: 'Not configured',
    details: '',
    inviteText: '',
    copied: false
  }),
  computed: {
    canSync() {
      return Boolean(this.remotePath && this.remotePath.trim())
    }
  },
  methods: {
    readEnvelope(response) {
      if (!response?.ok) throw new Error(response?.error?.message || 'Sync request failed.')
      return response.data || {}
    },
    describeStatus(data = {}) {
      if (data.running) return 'Syncing'
      if (data.lastError) return data.lastError
      if (data.configured || data.remotePath) return data.firstRunDone ? 'Synced once' : 'Ready'
      return 'Not configured'
    },
    async refreshStatus() {
      try {
        const data = this.readEnvelope(await window.elephantnote.api.call('sync.status'))
        this.remotePath = data.remotePath || this.remotePath
        this.statusLabel = this.describeStatus(data)
        this.details = data.capabilities?.mobileSyncRequiresBackend
          ? 'Mobile devices join through the same shared location, not through a local rclone binary.'
          : 'This desktop can run rclone locally.'
      } catch (error) {
        this.statusLabel = error?.message || 'Unable to read sync status.'
      }
    },
    async saveLocation() {
      try {
        const data = this.readEnvelope(await window.elephantnote.api.call('sync.run', {
          init: { remotePath: this.remotePath }
        }))
        this.statusLabel = this.describeStatus(data)
        this.details = 'Sync location saved. Use the same location on your phone.'
        this.buildInvite()
      } catch (error) {
        this.statusLabel = error?.message || 'Unable to save sync location.'
      }
    },
    async syncNow() {
      try {
        const data = this.readEnvelope(await window.elephantnote.api.call('sync.run', {
          remotePath: this.remotePath,
          sync: {}
        }))
        this.statusLabel = this.describeStatus(data)
        this.details = data.lastError || 'Sync completed.'
        this.buildInvite()
      } catch (error) {
        this.statusLabel = error?.message || 'Unable to run sync.'
      }
    },
    buildInvite() {
      const payload = {
        type: 'elephant-sync-invite',
        version: 1,
        provider: 'shared-location',
        remotePath: this.remotePath,
        note: 'Open Elephant Note on your phone and choose Join existing sync, then enter this same shared location.'
      }
      this.inviteText = JSON.stringify(payload, null, 2)
      this.copied = false
    },
    async copyInvite() {
      this.copied = await copyToClipboard(this.inviteText)
    }
  },
  mounted() {
    this.refreshStatus().catch(() => {})
  },
  render() {
    return h('div', { class: 'pref-rclone sync-settings' }, [
      h('h4', 'Sync'),
      h('div', { class: 'sync-card' }, [
        h('h5', '1. Choose a shared sync location'),
        h('p', 'Use a folder or rclone remote that every device can access, for example a NAS/WebDAV folder, Google Drive, OneDrive, SFTP, or a local test folder.'),
        h('input', {
          class: 'sync-input',
          value: this.remotePath,
          placeholder: 'remote:ElephantNote or /Volumes/NAS/ElephantNote',
          onInput: (event) => { this.remotePath = event.target.value }
        }),
        h('div', { class: 'sync-actions' }, [
          h('button', { onClick: this.refreshStatus }, 'Refresh status'),
          h('button', { disabled: !this.canSync, onClick: this.saveLocation }, 'Save location'),
          h('button', { disabled: !this.canSync, onClick: this.syncNow }, 'Sync now')
        ])
      ]),
      h('div', { class: 'sync-card' }, [
        h('h5', '2. Link a phone'),
        h('p', 'On the phone, choose Join existing sync and enter the same shared location. The phone uses a mobile provider for that location; it does not need to run a desktop rclone binary.'),
        h('button', { disabled: !this.canSync, onClick: this.buildInvite }, 'Create phone invite'),
        this.inviteText ? h('pre', { class: 'sync-invite' }, this.inviteText) : null,
        this.inviteText ? h('button', { onClick: this.copyInvite }, this.copied ? 'Copied' : 'Copy invite') : null
      ]),
      h('div', { class: 'sync-card' }, [
        h('h5', 'Status'),
        h('p', this.statusLabel),
        this.details ? h('p', { class: 'sync-details' }, this.details) : null
      ])
    ])
  }
}
