const getBridge = () => globalThis.window?.elephantnote
const normalizePayload = (payload = {}) => (payload && typeof payload === 'object' ? payload : {})
const directoryListPayload = (payload = '') => {
  if (typeof payload === 'string') return payload
  const normalizedPayload = normalizePayload(payload)
  const keys = Object.keys(normalizedPayload)
  if (
    keys.length === 1 &&
    Object.prototype.hasOwnProperty.call(normalizedPayload, 'relativePath')
  ) {
    return normalizedPayload.relativePath || ''
  }
  return normalizedPayload
}

const callSyncPlan = (payload = {}) =>
  getBridge()?.sync?.plan?.(normalizePayload(payload))

export const COMPATIBILITY_CALLS = {
  'vaults.get': () => getBridge()?.getVaults?.(),
  'vaults.select': () => getBridge()?.selectVault?.(),
  'vaults.setActive': ({ vaultId }) => getBridge()?.setActiveVault?.(vaultId),
  'vaults.setIcon': (payload) => getBridge()?.setVaultIcon?.(payload),
  'vaults.setName': (payload) => getBridge()?.setVaultName?.(payload),
  'vaults.remove': (payload) => getBridge()?.removeVault?.(payload),
  'directory.list': (payload = '') => getBridge()?.listDirectory?.(directoryListPayload(payload)),
  'notes.create': (payload = {}) => {
    const normalizedPayload = typeof payload === 'string' ? { relativePath: payload } : payload
    return getBridge()?.createNote?.(normalizedPayload)
  },
  'folders.create': ({ relativePath = '' }) => getBridge()?.createFolder?.({ relativePath }),
  'sidebar.attach': (payload) => getBridge()?.attachSidebarEntry?.(payload),
  'sidebar.detach': ({ relativePath }) => getBridge()?.detachSidebarEntry?.({ relativePath }),
  'entries.rename': (payload) => getBridge()?.renameEntry?.(payload),
  'entries.move': (payload) => getBridge()?.moveEntry?.(payload),
  'entries.delete': ({ relativePath }) => getBridge()?.deleteEntry?.({ relativePath }),
  'import.googleKeep': () => getBridge()?.importGoogleKeep?.(),
  'calendar.list': () => getBridge()?.calendar?.list?.(),
  'calendar.importGoogle': () => getBridge()?.calendar?.importGoogle?.(),
  'calendar.importGoogleFromPath': (payload) =>
    getBridge()?.calendar?.importGoogleFromPath?.(payload),
  'calendar.google.config.get': () => getBridge()?.calendar?.googleConfigGet?.(),
  'calendar.google.config.set': (payload) => getBridge()?.calendar?.googleConfigSet?.(payload),
  'calendar.google.sync': () => getBridge()?.calendar?.googleSync?.(),
  'sources.list': () => getBridge()?.sources?.list?.(),
  'sources.ingestUrl': (payload) => getBridge()?.sources?.ingestUrl?.(payload),
  'sources.importRss': (payload) => getBridge()?.sources?.importRss?.(payload),
  'wiki.list': () => getBridge()?.wiki?.list?.(),
  'wiki.propose': () => getBridge()?.wiki?.propose?.(),
  'wiki.accept': (payload) => getBridge()?.wiki?.accept?.(payload),
  'wiki.dismiss': (payload) => getBridge()?.wiki?.dismiss?.(payload),
  'wiki.sourceInfo': (payload) => getBridge()?.wiki?.sourceInfo?.(payload),
  'wiki.context': (payload) => getBridge()?.wiki?.context?.(payload),
  'search.initVault': ({ vaultPath }) => getBridge()?.search?.initVault?.(vaultPath),
  'search.query': (payload) => getBridge()?.search?.query?.(payload),
  'search.concepts': (payload) => getBridge()?.search?.concepts?.(payload),
  'search.status': () => getBridge()?.search?.status?.(),
  'search.inspect': () => getBridge()?.search?.inspect?.(),
  'search.rebuild': () => getBridge()?.search?.rebuild?.(),
  'search.clear': () => getBridge()?.search?.clear?.(),
  'search.disable': () => getBridge()?.search?.disable?.(),
  'search.enable': () => getBridge()?.search?.enable?.(),
  'sites.previewFolder': (payload) => getBridge()?.sitePreview?.previewFolder?.(payload),
  'sites.buildFolder': (payload) => getBridge()?.sitePreview?.buildFolder?.(payload),
  'sites.stop': ({ siteId }) => getBridge()?.sitePreview?.stop?.(siteId),
  'sites.status': ({ siteId }) => getBridge()?.sitePreview?.status?.(siteId),
  'sites.openExternal': ({ url }) => getBridge()?.sitePreview?.openExternal?.(url),
  'features.get': () => getBridge()?.features?.get?.(),
  'features.set': ({ key, enabled }) => getBridge()?.features?.set?.(key, enabled),
  'ai.config.get': () => getBridge()?.ai?.getConfig?.(),
  'ai.config.set': (payload) => getBridge()?.ai?.setConfig?.(payload),
  'ai.config.test': (payload) => getBridge()?.ai?.testConfig?.(payload),
  'atomic.catalog.get': () => getBridge()?.atomic?.getCatalog?.(),
  'models.selection.get': () => getBridge()?.models?.getSelection?.(),
  'models.selection.set': (payload) => getBridge()?.models?.setSelection?.(payload),
  'plugins.list': () => getBridge()?.plugins?.list?.(),
  'plugins.set': (payload) => getBridge()?.plugins?.set?.(payload),
  'plugins.run': (payload) => getBridge()?.plugins?.run?.(payload),
  'tasks.list': () => getBridge()?.tasks?.list?.(),
  'tasks.set': (payload) => getBridge()?.tasks?.set?.(payload),
  'tasks.run': (payload) => getBridge()?.tasks?.run?.(payload),
  'agents.list': () => getBridge()?.agents?.list?.(),
  'agents.register': (payload) => getBridge()?.agents?.register?.(payload),
  'agents.unregister': ({ id }) => getBridge()?.agents?.unregister?.(id),
  'agents.send': (payload) => getBridge()?.agents?.send?.(payload),
  'rag.chat': (payload) => getBridge()?.rag?.chat?.(payload),
  'notes.autotag': (payload) => getBridge()?.notes?.autotag?.(payload),
  'mcp.tools.list': () => getBridge()?.mcp?.listTools?.(),
  'mcp.tools.call': (payload) => getBridge()?.mcp?.callTool?.(payload),
  'models.local.list': () => getBridge()?.models?.listLocal?.(),
  'models.download': (payload) => getBridge()?.models?.download?.(payload),
  'models.list': () => getBridge()?.models?.list?.(),
  'models.searchHuggingFace': (payload) => getBridge()?.models?.searchHuggingFace?.(payload),
  'models.info': (payload) => getBridge()?.models?.info?.(payload),
  'models.activate': (payload) => getBridge()?.models?.activate?.(payload),
  'models.deactivate': (payload) => getBridge()?.models?.deactivate?.(payload),
  'models.remove': (payload) => getBridge()?.models?.remove?.(payload),
  'models.active': () => getBridge()?.models?.active?.(),
  'models.cancelDownload': (payload) => getBridge()?.models?.cancelDownload?.(payload),
  'models.downloadStatus': (payload) => getBridge()?.models?.downloadStatus?.(payload),
  'models.refreshIndex': () => getBridge()?.models?.refreshIndex?.(),
  'ocr.extract': (payload) => getBridge()?.ocr?.extract?.(payload),
  'sync.status': () => getBridge()?.sync?.status?.(),
  'sync.plan': (payload) => callSyncPlan(payload),
  'sync.enqueue': ({ operation, payload }) => getBridge()?.sync?.enqueue?.(operation, payload),
  'sync.run': (payload) => getBridge()?.sync?.run?.(payload)
}
