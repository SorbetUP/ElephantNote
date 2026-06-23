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

const normalizeModelSearchPayload = (payload = {}) => {
  const next = { ...normalizePayload(payload) }
  // Hugging Face does not reliably treat `library=gguf` as a broad GGUF catalog filter.
  // Keep the text query (`gguf`) and let the renderer's existing filters decide what is usable.
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
    case 'muya.editorSnapshot': return bridge.muya.editorSnapshot(payload)
    case 'attachments.list': return bridge.attachments.list(payload)
    case 'attachments.writeText': return bridge.attachments.writeText(payload)
    case 'drawings.list': return bridge.drawings.list(payload)
    case 'drawings.create': return bridge.drawings.create(payload)
    case 'drawings.read': return bridge.drawings.read(payload)
    case 'drawings.write': return bridge.drawings.write(payload)
    case 'calendar.list': return bridge.calendar.list()
    case 'calendar.importGoogle': return bridge.calendar.importGoogle()
    case 'calendar.importGoogleFromPath': return bridge.calendar.importGoogleFromPath(payload)
    case 'calendar.google.config.get': return bridge.calendar.googleConfigGet()
    case 'calendar.google.config.set': return bridge.calendar.googleConfigSet(payload)
    case 'calendar.google.sync': return bridge.calendar.googleSync()
    case 'sources.list': return bridge.sources.list()
    case 'sources.ingestUrl': return bridge.sources.ingestUrl(payload)
    case 'sources.importRss': return bridge.sources.importRss(payload)
    case 'wiki.list': return bridge.wiki.list()
    case 'wiki.propose': return bridge.wiki.propose()
    case 'wiki.accept': return bridge.wiki.accept(payload)
    case 'wiki.dismiss': return bridge.wiki.dismiss(payload)
    case 'wiki.sourceInfo': return bridge.wiki.sourceInfo(payload)
    case 'wiki.context': return bridge.wiki.context(payload)
    case 'search.initVault': return bridge.search.initVault(payload.vaultPath || '')
    case 'search.query': return bridge.search.query(payload)
    case 'search.status': return bridge.search.status()
    case 'search.inspect': return bridge.search.inspect()
    case 'search.rebuild': return bridge.search.rebuild()
    case 'search.clear': return bridge.search.clear()
    case 'search.disable': return bridge.search.disable()
    case 'search.enable': return bridge.search.enable()
    case 'sync.status': return bridge.sync.status()
    case 'sync.plan': return bridge.sync.plan()
    case 'sync.enqueue': return bridge.sync.enqueue(payload.operation, payload.payload || {})
    case 'sync.run': return bridge.sync.run(payload)
    case 'models.getSelection':
    case 'models.selection.get': return bridge.models.getSelection()
    case 'models.setSelection':
    case 'models.selection.set': return bridge.models.setSelection(payload)
    case 'models.local.list': return bridge.models.listLocal()
    case 'models.list': return bridge.models.list()
    case 'models.download': return bridge.models.download(payload)
    case 'models.searchHuggingFace': return bridge.models.searchHuggingFace(payload)
    case 'models.info': return bridge.models.info(payload)
    case 'models.activate': return bridge.models.activate(payload)
    case 'models.deactivate': return bridge.models.deactivate(payload)
    case 'models.remove': return bridge.models.remove(payload)
    case 'models.active': return bridge.models.active()
    case 'models.cancelDownload': return bridge.models.cancelDownload(payload)
    case 'models.downloadStatus': return bridge.models.downloadStatus(payload)
    case 'models.refreshIndex': return bridge.models.refreshIndex()
    case 'ai.config.get': return bridge.ai.getConfig()
    case 'ai.config.set': return bridge.ai.setConfig(payload)
    case 'ai.config.test': return bridge.ai.testConfig(payload)
    case 'features.get': return bridge.features.get()
    case 'features.set': return bridge.features.set(payload.key, payload.enabled)
    case 'ocr.extract': return bridge.ocr.extract(payload)
    case 'atomic.catalog.get': return bridge.atomic.getCatalog()
    case 'agents.list': return bridge.agents.list()
    case 'agents.register': return bridge.agents.register(payload)
    case 'agents.unregister': return bridge.agents.unregister(payload.id)
    case 'agents.send': return bridge.agents.send(payload)
    case 'plugins.list': return bridge.plugins.list()
    case 'plugins.set': return bridge.plugins.set(payload)
    case 'plugins.run': return bridge.plugins.run(payload)
    case 'tasks.list': return bridge.tasks.list()
    case 'tasks.set': return bridge.tasks.set(payload)
    case 'tasks.run': return bridge.tasks.run(payload)
    case 'rag.chat': return bridge.rag.chat(payload)
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
  'ai.config.get', 'ai.config.set', 'ai.config.test', 'features.get', 'features.set', 'ocr.extract'
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
    writeNote: (payload = {}) => invoke(target, 'tauri_notes_write', normalizePayload(payload)),
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
      write: (payload = {}) => invoke(target, 'tauri_notes_write', normalizePayload(payload)),
      autotag: async() => ({ tags: [] })
    },

    markdown: {
      parse: (payload = '') => invoke(target, 'tauri_markdown_parse', asMarkdownPayload(payload)),
      renderHtml: (payload = '') => invoke(target, 'tauri_markdown_render_html', asMarkdownPayload(payload)),
      toText: (payload = '') => invoke(target, 'tauri_markdown_to_text', asMarkdownPayload(payload)),
      extractFrontmatter: (payload = '') => invoke(target, 'tauri_markdown_extract_frontmatter', asMarkdownPayload(payload)),
      extractLinks: (payload = '') => invoke(target, 'tauri_markdown_extract_links', asMarkdownPayload(payload))
    },

    muya: {
      parse: (payload = '') => invoke(target, 'tauri_muya_parse', asMarkdownPayload(payload)),
      renderHtml: (payload = '') => invoke(target, 'tauri_muya_render_html', asMarkdownPayload(payload)),
      tokens: (payload = '') => invoke(target, 'tauri_muya_tokens', asMarkdownPayload(payload)),
      extras: (payload = '') => invoke(target, 'tauri_muya_extras', asMarkdownPayload(payload)),
      contract: (payload = '') => invoke(target, 'tauri_muya_contract', asMarkdownPayload(payload)),
      clipboard: (payload = {}) => invoke(target, 'tauri_muya_clipboard', normalizePayload(payload)),
      copyMarkdown: (payload = {}) => invoke(target, 'tauri_muya_copy_markdown', normalizePayload(payload)),
      copyHtml: (payload = {}) => invoke(target, 'tauri_muya_copy_html', normalizePayload(payload)),
      paste: (payload = {}) => invoke(target, 'tauri_muya_paste', normalizePayload(payload)),
      backspace: (payload = {}) => invoke(target, 'tauri_muya_backspace', normalizePayload(payload)),
      removeNext: (payload = {}) => invoke(target, 'tauri_muya_remove_next', normalizePayload(payload)),
      undo: (payload = {}) => invoke(target, 'tauri_muya_undo', normalizePayload(payload)),
      redo: (payload = {}) => invoke(target, 'tauri_muya_redo', normalizePayload(payload)),
      moveCursor: (payload = {}) => invoke(target, 'tauri_muya_move_cursor', normalizePayload(payload)),
      inputRule: (payload = {}) => invoke(target, 'tauri_muya_input_rule', normalizePayload(payload)),
      tableInsertRow: (payload = {}) => invoke(target, 'tauri_muya_table_insert_row', normalizePayload(payload)),
      tableInsertColumn: (payload = {}) => invoke(target, 'tauri_muya_table_insert_column', normalizePayload(payload)),
      tableContract: (payload = {}) => invoke(target, 'tauri_muya_table_contract', normalizePayload(payload)),
      imageSelection: (payload = {}) => invoke(target, 'tauri_muya_image_selection', normalizePayload(payload)),
      startComposition: (payload = {}) => invoke(target, 'tauri_muya_start_composition', normalizePayload(payload)),
      updateComposition: (payload = {}) => invoke(target, 'tauri_muya_updateComposition', normalizePayload(payload)),
      commitComposition: (payload = {}) => invoke(target, 'tauri_muya_commit_composition', normalizePayload(payload)),
      cancelComposition: (payload = {}) => invoke(target, 'tauri_muya_cancel_composition', normalizePayload(payload)),
      editorSnapshot: (payload = {}) => invoke(target, 'tauri_muya_editor_snapshot', normalizePayload(payload))
    },

    attachments: {
      list: () => invoke(target, 'tauri_attachments_list'),
      writeText: (payload = {}) => invoke(target, 'tauri_attachments_write_text', normalizePayload(payload))
    },

    drawings: {
      list: () => invoke(target, 'tauri_drawings_list'),
      create: (payload = {}) => invoke(target, 'tauri_drawings_create', normalizePayload(payload)),
      read: (payload = {}) => invoke(target, 'tauri_drawings_read', asRelativePathPayload(payload)),
      write: (payload = {}) => invoke(target, 'tauri_drawings_write', normalizePayload(payload))
    },

    calendar: {
      list: () => invoke(target, 'tauri_calendar_list'),
      importGoogle: async() => createDesktopOnlyResult('Google Calendar import'),
      importGoogleFromPath: async() => createDesktopOnlyResult('Google Calendar import from path'),
      googleConfigGet: async() => ({}),
      googleConfigSet: async(config) => config,
      googleSync: async() => createDesktopOnlyResult('Google Calendar sync')
    },

    sources: {
      list: () => invoke(target, 'tauri_sources_list'),
      ingestUrl: async() => createDesktopOnlyResult('source URL ingestion'),
      importRss: async() => createDesktopOnlyResult('RSS import')
    },

    wiki: {
      list: async() => {
        const result = await invoke(target, 'tauri_wiki_list')
        return Array.isArray(result) ? { records: result } : { records: Array.isArray(result?.records) ? result.records : [] }
      },
      propose: async() => [],
      accept: async() => null,
      dismiss: async() => null,
      sourceInfo: async() => null,
      context: async() => ({ records: [], notes: [] })
    },

    search: {
      initVault: (vaultPath = '') => Promise.resolve({ ok: true, runtime: 'tauri-rust', vaultPath }),
      query: (params = {}) => invoke(target, 'tauri_search_query', { params }),
      status: () => invoke(target, 'tauri_search_status'),
      rebuild: () => invoke(target, 'tauri_search_rebuild'),
      inspect: () => invoke(target, 'tauri_search_inspect'),
      clear: async() => ({ ok: true, runtime: 'tauri-rust' }),
      disable: async() => ({ ok: true, runtime: 'tauri-rust' }),
      enable: async() => ({ ok: true, runtime: 'tauri-rust' })
    },

    sync: {
      status: () => invoke(target, 'tauri_sync_status'),
      plan: () => invoke(target, 'tauri_sync_plan'),
      enqueue: (operation, payload = {}) => invoke(target, 'tauri_sync_enqueue', { operation, payload }),
      run: (payloadByOperation = {}) => invoke(target, 'tauri_sync_run', { payloadByOperation })
    },

    models: {
      list: () => invoke(target, 'tauri_models_list'),
      listLocal: () => invoke(target, 'tauri_models_list_local'),
      getSelection: () => callWithLocalFallback(target, 'tauri_models_get_selection', {}, MODEL_SELECTION_STORAGE_KEY, defaultModelSelection()),
      setSelection: async(selection = {}) => {
        const normalized = { ...defaultModelSelection(), ...normalizePayload(selection) }
        try {
          const result = await invoke(target, 'tauri_models_set_selection', { selection: normalized })
          return writeStoredJson(target, MODEL_SELECTION_STORAGE_KEY, result || normalized)
        } catch {
          return writeStoredJson(target, MODEL_SELECTION_STORAGE_KEY, normalized)
        }
      },
      active: () => invoke(target, 'tauri_models_active'),
      searchHuggingFace: (payload = {}) => invoke(target, 'tauri_models_search_hugging_face', { payload: normalizeModelSearchPayload(payload) }),
      info: (payload = {}) => invoke(target, 'tauri_models_info', { payload: normalizePayload(payload) }),
      download: (payload = {}) => invoke(target, 'tauri_models_download', { payload: normalizePayload(payload) }),
      cancelDownload: (payload = {}) => invoke(target, 'tauri_models_cancel_download', { payload: normalizePayload(payload) }),
      downloadStatus: (payload = {}) => invoke(target, 'tauri_models_download_status', { payload: normalizePayload(payload) }),
      activate: (payload = {}) => invoke(target, 'tauri_models_activate', { payload: normalizePayload(payload) }),
      deactivate: (payload = {}) => invoke(target, 'tauri_models_deactivate', { payload: normalizePayload(payload) }),
      remove: (payload = {}) => invoke(target, 'tauri_models_delete', { payload: normalizePayload(payload) }),
      refreshIndex: () => invoke(target, 'tauri_models_refresh_index'),
      onDownloadProgress: (listener) => onTauriProgress('elephantnote:models:download:progress', listener)
    },

    ai: {
      getConfig: () => callWithLocalFallback(target, 'tauri_ai_config_get', {}, AI_CONFIG_STORAGE_KEY, defaultAiConfig()),
      setConfig: async(config = {}) => {
        const normalized = { ...defaultAiConfig(), ...normalizePayload(config) }
        try {
          const result = await invoke(target, 'tauri_ai_config_set', { config: normalized })
          return writeStoredJson(target, AI_CONFIG_STORAGE_KEY, result || normalized)
        } catch {
          return writeStoredJson(target, AI_CONFIG_STORAGE_KEY, normalized)
        }
      },
      testConfig: async(config = {}) => {
        try {
          return invoke(target, 'tauri_ai_config_test', { config: normalizePayload(config) })
        } catch {
          return { ok: true, runtime: 'tauri-local', latencyMs: 0, config: normalizePayload(config) }
        }
      }
    },

    features: {
      get: () => callWithLocalFallback(target, 'tauri_features_get', {}, FEATURES_STORAGE_KEY, defaultFeatures()),
      set: async(key, enabled = true) => {
        const current = readStoredJson(target, FEATURES_STORAGE_KEY, defaultFeatures())
        const next = { ...current, [key]: enabled !== false }
        try {
          const result = await invoke(target, 'tauri_features_set', { key, enabled: enabled !== false })
          return writeStoredJson(target, FEATURES_STORAGE_KEY, result || next)
        } catch {
          return writeStoredJson(target, FEATURES_STORAGE_KEY, next)
        }
      }
    },

    sitePreview: {
      previewFolder: async() => createDesktopOnlyResult('site preview'),
      buildFolder: async() => createDesktopOnlyResult('site build'),
      stop: async() => ({ ok: true }),
      status: async() => null,
      openExternal: async(url) => target.electron?.shell?.openExternal?.(url)
    },

    atomicFeatures: {
      describeApi: async() => ({ runtime: 'tauri-rust', actions: [] }),
      callApi: async() => null,
      providers: async() => [],
      overview: async() => null,
      graph: async() => null,
      wiki: async() => null,
      createWikiPage: async() => null,
      summarize: async() => null,
      structure: async() => null,
      autoNameNote: async() => null,
      listLocalModels: async() => [],
      pullModel: async() => createDesktopOnlyResult('model pull'),
      onModelPullProgress: () => () => {}
    },

    agents: { list: async() => [], register: async() => null, unregister: async() => null, send: async() => null },
    atomic: { getCatalog: async() => [] },
    plugins: { list: async() => [], set: async(payload) => payload, run: async() => null },
    tasks: { list: async() => [], set: async(payload) => payload, run: async() => null },
    rag: { chat: async() => ({ answer: '', sources: [] }) },
    mcp: { listTools: async() => [], callTool: async() => null },
    programs: { list: async() => [], set: async(payload) => payload, run: async() => null },
    ocr: { extract: async() => createDesktopOnlyResult('OCR extraction') },
    clipboard: {
      writeText: async(text) => target.electron?.clipboard?.writeText?.(text),
      readText: async() => target.electron?.clipboard?.readText?.()
    }
  }

  bridge.api = {
    describe: async() => ({
      runtime: 'tauri',
      backend: 'rust',
      bridge: 'elephantnote-tauri',
      actions: apiActions
    }),
    call: async(action, payload = {}) => ({
      ok: true,
      data: await dispatchApiAction(bridge, action, normalizePayload(payload))
    })
  }

  return bridge
}

export const installTauriElephantNoteBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target?.elephantnote?.getVaults) return false
  target.elephantnote = {
    ...(target.elephantnote || {}),
    ...createBridge(target)
  }
  return true
}
