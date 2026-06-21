import { h } from 'vue'

export default {
  name: 'RcloneSettings',
  data: () => ({
    remotePath: '',
    statusLabel: 'Not configured'
  }),
  render() {
    return h('div', { class: 'pref-rclone' }, [
      h('h4', 'Sync'),
      h('p', 'Rclone vault transfer'),
      h('p', `Status: ${this.statusLabel}`),
      h('input', {
        value: this.remotePath,
        placeholder: 'remote:ElephantVault',
        onInput: (event) => { this.remotePath = event.target.value }
      })
    ])
  }
}
