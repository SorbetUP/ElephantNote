import { h } from 'vue'

export default {
  name: 'RcloneSettings',
  data: () => ({
    remotePath: '',
    statusLabel: 'Not configured'
  }),
  methods: {
    readEnvelope(response) {
      if (!response?.ok) throw new Error(response?.error?.message || 'Sync request failed.')
      return response.data || {}
    },
    async refreshStatus() {
      try {
        const data = this.readEnvelope(await window.elephantnote.api.call('sync.status'))
        this.remotePath = data.remotePath || this.remotePath
        this.statusLabel = data.running ? 'Running' : (data.remotePath ? 'Ready' : 'Not configured')
      } catch (error) {
        this.statusLabel = error?.message || 'Unable to read status.'
      }
    },
    async runNow() {
      try {
        const data = this.readEnvelope(await window.elephantnote.api.call('sync.run', {
          init: { remotePath: this.remotePath },
          snapshot: {}
        }))
        this.statusLabel = data.lastError || 'Done'
      } catch (error) {
        this.statusLabel = error?.message || 'Unable to run rclone.'
      }
    }
  },
  mounted() {
    this.refreshStatus().catch(() => {})
  },
  render() {
    return h('div', { class: 'pref-rclone' }, [
      h('h4', 'Sync'),
      h('p', 'Rclone vault transfer'),
      h('p', `Status: ${this.statusLabel}`),
      h('input', {
        value: this.remotePath,
        placeholder: 'remote:ElephantVault',
        onInput: (event) => { this.remotePath = event.target.value }
      }),
      h('button', { onClick: this.refreshStatus }, 'Refresh'),
      h('button', { onClick: this.runNow }, 'Run now')
    ])
  }
}
