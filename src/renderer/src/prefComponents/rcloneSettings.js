import { h } from 'vue'

export default {
  name: 'RcloneSettings',
  data: () => ({
    remotePath: '',
    statusLabel: 'Not configured'
  }),
  methods: {
    async refreshStatus() {
      const response = await window.elephantnote.api.call('sync.status')
      const data = response?.data || {}
      this.remotePath = data.remotePath || this.remotePath
      this.statusLabel = data.running ? 'Running' : (data.remotePath ? 'Ready' : 'Not configured')
    },
    async runNow() {
      const response = await window.elephantnote.api.call('sync.run', {
        init: { remotePath: this.remotePath },
        snapshot: {}
      })
      const data = response?.data || {}
      this.statusLabel = data.lastError || 'Done'
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
