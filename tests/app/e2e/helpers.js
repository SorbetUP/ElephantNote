const installTauriMock = async(page, options = {}) => {
  const vaults = Array.isArray(options.vaults) ? options.vaults : []
  const activeVault = options.activeVault || null

  await page.addInitScript(({ vaults, activeVault }) => {
    const calls = []
    const invoke = async(command, payload = {}) => {
      calls.push({ command, payload })

      if (command === 'tauri_debug_log') return true
      if (command === 'plugin:path|resolve_directory') return '/tmp/elephant-e2e'
      if (command === 'tauri_vaults_get') return { vaults, activeVault }
      if (command === 'tauri_knowledge_status') {
        return { documents: 0, chunks: 0, database_path: '/tmp/elephant-e2e/knowledge.sqlite' }
      }
      if (command === 'tauri_knowledge_graph') return { nodes: [], edges: [], clusters: [] }
      if (command === 'tauri_knowledge_wikis_list') return []
      if (command === 'tauri_models_get_selection') return { embedding: '', chat: '', ocr: '' }
      if (command === 'tauri_models_list' || command === 'tauri_models_list_local') return []
      if (command === 'tauri_directory_list' || command === 'tauri_recents_list') return []
      if (command.endsWith('_status')) return {}
      if (command.endsWith('_list')) return []
      if (command.endsWith('_get')) return {}
      return null
    }

    window.__ELEPHANT_E2E_TAURI_CALLS__ = calls
    window.__TAURI__ = {
      core: { invoke },
      fs: {},
      event: {
        listen: async() => () => {}
      }
    }
    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => 1,
      unregisterCallback: () => {}
    }
  }, { vaults, activeVault })
}

const openTauriRenderer = async(page, options = {}) => {
  await installTauriMock(page, options)
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('#app')?.childElementCount > 0, null, {
    timeout: 15000
  })
  return page
}

module.exports = {
  installTauriMock,
  openTauriRenderer
}
