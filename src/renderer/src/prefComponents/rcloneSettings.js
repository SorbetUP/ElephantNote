import { h } from 'vue'

export default {
  name: 'RcloneSettings',
  render() {
    return h('div', { class: 'pref-rclone' }, [
      h('h4', 'Sync'),
      h('p', 'Rclone vault transfer'),
      h('p', 'Use sync.run with init.remotePath and snapshot to run bisync.')
    ])
  }
}
