const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (target, command, payload = {}) => {
  const core = getCore(target)
  if (!core?.invoke) {
    throw new Error(`Tauri command API is unavailable for ${command}`)
  }
  return core.invoke(command, payload)
}

const openVaultDirectory = async() => {
  const dialog = await import('@tauri-apps/plugin-dialog')
  return dialog.open({ multiple: false, directory: true, createDirectory: true })
}

const listenToTauriEvent = async(eventName, handler) => {
  const events = await import('@tauri-apps/api/event')
  return events.listen(eventName, handler)
}

const STORAGE_PREFIX = 'elephantnote:tauri:'
const AI_CONFIG_STORAGE_KEY = `${STORAGE_PREFIX}ai-config`
const FEATURES_STORAGE_KEY = `${STORAGE_PREFIX}features`
const MODEL_SELECTION_STORAGE_KEY = `${STORAGE_PREFIX}model-selection`

const normalizePayload = (payload = {}) => (payload && typeof payload === 'object' ? payload : {})
const asRelativePathPayload = (payload = {}) => {
  if (typeof payload === 'string') return { relativePath: payload }
  return normalizePayload(payload)
}
const asMarkdownPayload = (payload = '') => (typeof payload === 'string' ? { markdown: payload } : normalizePayload(payload))
const asNoteWritePayload = (payload = {}) => {
  const value = normalizePayload(payload)
  return {
    relativePath: value.relativePath || value.relative_path || value.path || '',
    content: typeof value.content === 'string' ? value.content : String(value.markdown ?? '')
  }
}

const normalizeModelSearchPayload = (payload = {}) => {
  const next = { ...normalizePayload(payload) }
  if (String(next.libraryName || next.library || '').toLowerCase() === 'gguf') {
    delete next.libraryName
    delete next.library
  }
  return next
}

const readStoredJson = (target, key, fallback) => {
  try {
    const raw = target?.localStorage?.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeStoredJson = (target, key, value) => {
  try {
    target?.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage can be unavailable in some constrained webviews.
  }
  return value
}

const defaultFeatures = () => ({ askAi: true, sitePreview: false, gitSync: false })
const defaultAiConfig = () => ({
  localAi: { enabled: true, showModelLibraryInSidebar: true },
  providers: { list: [], codex: { connected: false, mode: 'account', model: '' } },
  routes: {},
  localModelSelection: {}
})
const defaultModelSelection = () => ({ embedding: '', chat: '', ocr: '' })

const createDesktopOnlyResult = (feature) => ({
  ok: false,
  runtime: 'tauri',
  reason: `${feature} is not implemented in the Rust Tauri backend yet.`
})

const onTauriProgress = (eventName, listener) => {
  if (typeof listener !== 'function') return () => {}
  let disposed = false
  let unlisten = null
  listenToTauriEvent(eventName, (event) => listener(event?.payload ?? event))
    .then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    .catch(() => {})
  return () => {
    disposed = true
    if (typeof unlisten === 'function') unlisten()
  }
}

const callWithLocalFallback = async(target, command, payload, storageKey, fallback, normalize = (value) => value) => {
  try {
    const result = await invoke(target, command, payload)
    return writeStoredJson(target, storageKey, normalize(result ?? fallback))
  } catch {
    return readStoredJson(target, storageKey, fallback)
  }
}

const dispatchApiAction = async(bridge, action, payload = {}) => {
  switch (action) {
    case 'api.describe': return bridge.api.describe()
    case 'vaults.get': return bridge.getVaults()
    case 'vaults.select': return bridge.selectVault()
    case 'vaults.setActive': return bridge.setActiveVault(payload.vaultId)
    case 'vaults.setIcon': return bridge.setVaultIcon(payload)
    case 'vaults.setName': return bridge.setVaultName(payload)
    case 'vaults.remove': return bridge.removeVault(payload)
    case 'directory.list': return bridge.listDirectory(payload.relativePath || '')
    case 'notes.create': return bridge.createNote(payload)
    case 'notes.read': return bridge.notes.read(payload)
    case 'notes.write': return bridge.notes.write(payload)
    case 'notes.autotag': return bridge.notes.autotag(payload)
    case 'folders.create': return bridge.createFolder(payload)
    case 'sidebar.attach': return bridge.attachSidebarEntry(payload)
    case 'sidebar.detach': return bridge.detachSidebarEntry(payload)
    case 'entries.rename': return bridge.renameEntry(payload)
    case 'entries.move': return bridge.moveEntry(payload)
    case 'entries.delete': return bridge.deleteEntry(payload)
    case 'import.googleKeep':
    case 'import.googleKeepFromPaths': return bridge.importGoogleKeep(payload)
    case 'markdown.parse': return bridge.markdown.parse(payload)
    case 'markdown.renderHtml': return bridge.markdown.renderHtml(payload)
    case 'markdown.toText': return bridge.markdown.toText(payload)
    case 'markdown.extractFrontmatter': return bridge.markdown.extractFrontmatter(payload)
    case 'markdown.extractLinks': return bridge.markdown.extractLinks(payload)
    case 'muya.parse': return bridge.muya.parse(payload)
    case 'muya.renderHtml': return bridge.muya.renderHtml(payload)
    case 'muya.tokens': return bridge.muya.tokens(payload)
    case 'muya.extras': return bridge.muya.extras(payload)
    case 'muya.contract': return bridge.muya.contract(payload)
    case 'muya.clipboard': return bridge.muya.clipboard(payload)
    case 'muya.copyMarkdown': return bridge.muya.copyMarkdown(payload)
    case 'muya.copyHtml': return bridge.muya.copyHtml(payload)
    case 'muya.paste': return bridge.muya.paste(payload)
    case 'muya.backspace': return bridge.muya.backspace(payload)
    case 'muya.removeNext': return bridge.muya.removeNext(payload)
    case 'muya.undo': return bridge.muya.undo(payload)
    case 'muya.redo': return bridge.muya.redo(payload)
    case 'muya.moveCursor': return bridge.muya.moveCursor(payload)
    case 'muya.inputRule': return bridge.muya.inputRule(payload)
    case 'muya.tableInsertRow': return bridge.muya.tableInsertRow(payload)
    case 'muya.tableInsertColumn': return bridge.muya.tableInsertColumn(payload)
    case 'muya.tableContract': return bridge.muya.tableContract(payload)
    case 'muya.imageSelection': return bridge.muya.imageSelection(payload)
    case 'muya.startComposition': return bridge.muya.startComposition(payload)
    case 'muya.updateComposition': return bridge.muya.updateComposition(payload)
    case 'muya.commitComposition': return bridge.muya.commitComposition(payload)
    case 'muya.cancelComposition': return bridge.muya.cancelComposition(payload)
    case 'calendar.list': return bridge.calendar.list()
    case 'sources.list': return bridge.sources.list()
    case 'wiki.list': return bridge.wiki.list()
    case 'wiki.context': return bridge.wiki.context(payload)
    case 'wiki.sourceInfo': return bridge.wiki.sourceInfo(payload)
    case 'wiki.propose': return bridge.wiki.propose(payload)
    case 'wiki.accept': return bridge.wiki.accept(payload)
    case 'wiki.dismiss': return bridge.wiki.dismiss(payload)
    case 'search.query': return bridge.search.query(payload)
    case 'search.status': return bridge.search.status()
    case 'search.rebuild': return bridge.search.rebuild()
    case 'search.inspect': return bridge.search.inspect()
    case 'sync.status': return bridge.sync.status()
    case 'sync.plan': return bridge.sync.plan()
    case 'sync.enqueue': return bridge.sync.enqueue(payload)
    case 'sync.run': return bridge.sync.run(payload)
    case 'models.getSelection':
    case 'models.selection.get': return bridge.models.getSelection()
    case 'models.setSelection':
    case 'models.selection.set': return bridge.models.setSelection(payload)
    case 'models.local.list': return bridge.models.listLocal()
    case 'models.list': return bridge.models.list()
    case 'models.searchHuggingFace': return bridge.models.searchHuggingFace(payload)
    case 'models.info': return bridge.models.info(payload)
    case 'models.download': return bridge.models.download(payload)
    case 'models.cancelDownload': return bridge.models.cancelDownload(payload)
    case 'models.downloadStatus': return bridge.models.downloadStatus(payload)
    case 'models.activate': return bridge.models.activate(payload)
    case 'models.deactivate': return bridge.models.deactivate(payload)
    case 'models.remove': return bridge.models.remove(payload)
    case 'models.active': return bridge.models.active()
    case 'models.refreshIndex': return bridge.models.refreshIndex()
    case 'rag.chat': return bridge.rag.chat(payload)
    case 'ai.config.get': return bridge.ai.getConfig()
    case 'ai.config.set': return bridge.ai.setConfig(payload)
    case 'ai.config.test': return bridge.ai.testConfig(payload)
    case 'features.get': return bridge.features.get()
    case 'features.set': return bridge.features.set(payload)
    case 'ocr.extract': return bridge.ocr.extract(payload)
    case 'agents.list': return bridge.agents.list()
    case 'agents.register': return bridge.agents.register(payload)
    case 'agents.unregister': return bridge.agents.unregister(payload.id || payload)
    case 'agents.send': return bridge.agents.send(payload.id, payload.message)
    case 'plugins.list': return bridge.plugins.list()
    case 'plugins.set': return bridge.plugins.set(payload.id, payload.enabled, payload.config)
    case 'plugins.run': return bridge.plugins.run(payload.id, payload.input)
    case 'tasks.list': return bridge.tasks.list()
    case 'tasks.set': return bridge.tasks.set(payload.id, payload.enabled)
    case 'tasks.run': return bridge.tasks.run(payload.id || payload)
    case 'mcp.tools.list': return bridge.mcp.listTools()
    case 'mcp.tools.call': return bridge.mcp.callTool(payload)
    case 'programs.list': return bridge.programs.list()
    case 'programs.set': return bridge.programs.set(payload)
    case 'programs.run': return bridge.programs.run(payload)
    case 'sites.previewFolder': return bridge.sitePreview.previewFolder(payload)
    case 'sites.buildFolder': return bridge.sitePreview.buildFolder(payload)
    case 'sites.stop': return bridge.sitePreview.stop(payload.siteId || payload)
    case 'sites.status': return bridge.sitePreview.status(payload.siteId || payload)
    case 'sites.openExternal': return bridge.sitePreview.openExternal(payload.url || payload)
    default: throw new Error(`ElephantNote Tauri bridge does not implement API action: ${action}`)
  }
}

const apiActions = [
  'vaults.get', 'vaults.select', 'vaults.setActive', 'vaults.setIcon', 'vaults.setName', 'vaults.remove',
  'directory.list', 'notes.create', 'notes.read', 'notes.write', 'folders.create', 'sidebar.attach', 'sidebar.detach', 'entries.rename', 'entries.move', 'entries.delete',
  'calendar.list', 'sources.list', 'wiki.list', 'search.query', 'search.status', 'search.rebuild', 'search.inspect',
  'sync.status', 'sync.plan', 'sync.enqueue', 'sync.run',
  'models.getSelection', 'models.setSelection', 'models.selection.get', 'models.selection.set', 'models.local.list', 'models.list', 'models.searchHuggingFace', 'models.info', 'models.download', 'models.cancelDownload', 'models.downloadStatus', 'models.activate', 'models.deactivate', 'models.remove', 'models.active', 'models.refreshIndex',
  'rag.chat', 'ai.config.get', 'ai.config.set', 'ai.config.test', 'features.get', 'features.set', 'ocr.extract'
]

const createBridge = (target) => {
  const bridge = {
    getVaults: () => invoke(target, 'tauri_vaults_get'),
    selectVault: async() => {
      const folder = await openVaultDirectory()
      const vaultPath = Array.isArray(folder) ? folder[0] : folder
      if (!vaultPath) return invoke(target, 'tauri_vaults_get')
      return invoke(target, 'tauri_vaults_select_path', { vaultPath })
    },
    setActiveVault: (vaultId) => invoke(target, 'tauri_vaults_set_active', { vaultId }),
    setVaultIcon: (payload = {}) => invoke(target, 'tauri_vaults_set_icon', normalizePayload(payload)),
    setVaultName: (payload = {}) => invoke(target, 'tauri_vaults_set_name', normalizePayload(payload)),
    removeVault: (payload = {}) => invoke(target, 'tauri_vaults_remove', normalizePayload(payload)),

    listDirectory: (relativePath = '') => invoke(target, 'tauri_directory_list', { relativePath }),
    createNote: (payload = {}) => invoke(target, 'tauri_notes_create', asRelativePathPayload(payload)),
    readNote: (payload = {}) => invoke(target, 'tauri_notes_read', asRelativePathPayload(payload)),
    writeNote: (payload = {}) => invoke(target, 'tauri_notes_write', asNoteWritePayload(payload)),
    createFolder: (payload = {}) => invoke(target, 'tauri_folders_create', asRelativePathPayload(payload)),
    attachSidebarEntry: (payload = {}) => invoke(target, 'tauri_sidebar_attach', {
      relativePath: payload.relativePath || payload.path || '',
      title: payload.title || '',
      entryType: payload.type || payload.entryType || ''
    }),
    detachSidebarEntry: (payload = {}) => invoke(target, 'tauri_sidebar_detach', normalizePayload(payload)),
    renameEntry: (payload = {}) => invoke(target, 'tauri_entries_rename', normalizePayload(payload)),
    moveEntry: (payload = {}) => invoke(target, 'tauri_entries_move', normalizePayload(payload)),
    deleteEntry: (payload = {}) => invoke(target, 'tauri_entries_delete', normalizePayload(payload)),

    importGoogleKeep: async() => createDesktopOnlyResult('Google Keep import'),

    notes: {
      read: (payload = {}) => invoke(target, 'tauri_notes_read', asRelativePathPayload(payload)),
      write: (payload = {}) => invoke(target, 'tauri_notes_write', asNoteWritePayload(payload)),
      autotag: async() => ({ tags: [] })
    },

    markdown: {
      parse: (payload = '') => invoke(target, 'tauri_markdown_parse', asMarkdownPayload(payload)),
      renderHtml: (payload = '') => invoke(target, 'tauri_markdown_render_html', asMarkdownPayload(payload)),
      toText: (payload = '') => invoke(target, 'tauri_markdown_to_text', asMarkdownPayload(payload)),
      extractFrontmatter: (payload = '') => invoke(target, 'tauri_markdown_extract_frontmatter', asMarkdownPayload(payload)),
      extractLinks: (payload = '') => invoke(target, 'tauri_markdown_extract_links', asMarkdownPayload(payload))
    },
