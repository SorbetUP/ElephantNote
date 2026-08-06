import { describe, expect, it, vi } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  ELEPHANTNOTE_API_EVENT_TOPICS as EVENTS
} from 'common/elephantnote/apiContractsV2'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'

const resolveMethod = (client, path) =>
  path.split('.').reduce((value, key) => value?.[key], client)

const CASES = [
  ['vaults.get', [], API.VAULTS_GET, {}],
  ['vaults.select', [], API.VAULTS_SELECT, {}],
  ['vaults.setActive', ['vault-1'], API.VAULTS_SET_ACTIVE, { vaultId: 'vault-1' }],
  ['vaults.setIcon', ['vault-1', 'book'], API.VAULTS_SET_ICON, { vaultId: 'vault-1', icon: 'book' }],
  ['vaults.setName', ['vault-1', 'Work'], API.VAULTS_SET_NAME, { vaultId: 'vault-1', name: 'Work' }],
  ['vaults.remove', ['vault-1'], API.VAULTS_REMOVE, { vaultId: 'vault-1' }],
  ['directory.list', ['Folder'], API.DIRECTORY_LIST, { relativePath: 'Folder' }],
  ['notes.create', ['Folder/Note.md'], API.NOTES_CREATE, { relativePath: 'Folder/Note.md' }],
  ['notes.read', ['Folder/Note.md'], API.NOTES_READ, { relativePath: 'Folder/Note.md' }],
  ['notes.write', [{ relativePath: 'Note.md', markdown: '# Note' }], API.NOTES_WRITE, { relativePath: 'Note.md', markdown: '# Note' }],
  ['notes.autotag', ['Note.md'], API.NOTES_AUTOTAG, { relativePath: 'Note.md' }],
  ['folders.create', ['Folder'], API.FOLDERS_CREATE, { relativePath: 'Folder' }],
  ['sidebar.attach', [{ relativePath: 'Note.md' }], API.SIDEBAR_ATTACH, { relativePath: 'Note.md' }],
  ['sidebar.detach', ['Note.md'], API.SIDEBAR_DETACH, { relativePath: 'Note.md' }],
  ['entries.rename', [{ relativePath: 'A.md', name: 'B.md' }], API.ENTRIES_RENAME, { relativePath: 'A.md', name: 'B.md' }],
  ['entries.move', [{ relativePath: 'A.md', destinationRelativePath: 'Folder/A.md' }], API.ENTRIES_MOVE, { relativePath: 'A.md', destinationRelativePath: 'Folder/A.md' }],
  ['entries.delete', ['A.md'], API.ENTRIES_DELETE, { relativePath: 'A.md' }],
  ['imports.googleKeep', [], API.IMPORT_GOOGLE_KEEP, {}],
  ['calendar.list', [], API.CALENDAR_LIST, {}],
  ['calendar.providers', [], API.CALENDAR_PROVIDERS_LIST, {}],
  ['calendar.import', ['google', { sourcePath: '/tmp/calendar.ics' }], API.CALENDAR_IMPORT, { provider: 'google', sourcePath: '/tmp/calendar.ics' }],
  ['calendar.getProviderConfig', ['google'], API.CALENDAR_PROVIDER_CONFIG_GET, { provider: 'google' }],
  ['calendar.setProviderConfig', ['google', { calendarId: 'primary' }], API.CALENDAR_PROVIDER_CONFIG_SET, { provider: 'google', config: { calendarId: 'primary' } }],
  ['calendar.sync', ['google', { full: true }], API.CALENDAR_SYNC, { provider: 'google', options: { full: true } }],
  ['calendar.importGoogle', [], API.CALENDAR_IMPORT, { provider: 'google' }],
  ['calendar.importGoogleFromPath', ['/tmp/calendar.ics'], API.CALENDAR_IMPORT, { provider: 'google', sourcePath: '/tmp/calendar.ics' }],
  ['calendar.getGoogleConfig', [], API.CALENDAR_PROVIDER_CONFIG_GET, { provider: 'google' }],
  ['calendar.setGoogleConfig', [{ calendarId: 'primary' }], API.CALENDAR_PROVIDER_CONFIG_SET, { provider: 'google', config: { calendarId: 'primary' } }],
  ['calendar.syncGoogle', [], API.CALENDAR_SYNC, { provider: 'google', options: {} }],
  ['sources.list', [], API.SOURCES_LIST, {}],
  ['sources.ingestUrl', ['https://example.com', 'Sources'], API.SOURCES_INGEST_URL, { url: 'https://example.com', destinationRelativePath: 'Sources' }],
  ['sources.importRss', ['https://example.com/feed.xml', 'Sources', 10], API.SOURCES_IMPORT_RSS, { url: 'https://example.com/feed.xml', destinationRelativePath: 'Sources', limit: 10 }],
  ['wiki.list', [], API.WIKI_LIST, {}],
  ['wiki.propose', [], API.WIKI_PROPOSE, {}],
  ['wiki.accept', ['proposal-1'], API.WIKI_ACCEPT, { id: 'proposal-1' }],
  ['wiki.dismiss', ['proposal-1'], API.WIKI_DISMISS, { id: 'proposal-1' }],
  ['wiki.sourceInfo', ['Note.md'], API.WIKI_SOURCE_INFO, { path: 'Note.md' }],
  ['wiki.context', ['Note.md', 8], API.WIKI_CONTEXT, { path: 'Note.md', limit: 8 }],
  ['search.initVault', ['/vault'], API.SEARCH_INIT_VAULT, { vaultPath: '/vault' }],
  ['search.query', [{ query: 'needle', mode: 'smart', limit: 10 }], API.SEARCH_QUERY, { query: 'needle', mode: 'smart', limit: 10 }],
  ['search.concepts', [{ query: 'graph', limit: 5 }], API.SEARCH_CONCEPTS, { query: 'graph', limit: 5 }],
  ['search.status', [], API.SEARCH_STATUS, {}],
  ['search.inspect', [], API.SEARCH_INSPECT, {}],
  ['search.rebuild', [], API.SEARCH_REBUILD, {}],
  ['search.clear', [], API.SEARCH_CLEAR, {}],
  ['search.disable', [], API.SEARCH_DISABLE, {}],
  ['search.enable', [], API.SEARCH_ENABLE, {}],
  ['sitePreview.previewFolder', [{ vaultRoot: '/vault', folderPath: 'Site' }], API.SITES_PREVIEW_FOLDER, { vaultRoot: '/vault', folderPath: 'Site' }],
  ['sitePreview.buildFolder', [{ vaultRoot: '/vault', folderPath: 'Site' }], API.SITES_BUILD_FOLDER, { vaultRoot: '/vault', folderPath: 'Site' }],
  ['sitePreview.stop', ['site-1'], API.SITES_STOP, { siteId: 'site-1' }],
  ['sitePreview.status', ['site-1'], API.SITES_STATUS, { siteId: 'site-1' }],
  ['sitePreview.openExternal', ['https://example.com'], API.SITES_OPEN_EXTERNAL, { url: 'https://example.com' }],
  ['features.get', [], API.FEATURES_GET, {}],
  ['features.set', ['wiki', true], API.FEATURES_SET, { key: 'wiki', enabled: true }],
  ['ai.getConfig', [], API.AI_CONFIG_GET, {}],
  ['ai.setConfig', [{}], API.AI_CONFIG_SET, {}],
  ['ai.testConfig', [{}], API.AI_CONFIG_TEST, {}],
  ['atomic.getCatalog', [], API.ATOMIC_CATALOG_GET, {}],
  ['atomicFeatures.describeApi', [], API.ATOMIC_API_DESCRIBE, {}],
  ['atomicFeatures.callApi', ['workspace.scan', { limit: 2 }], API.ATOMIC_API_CALL, { action: 'workspace.scan', arguments: { limit: 2 } }],
  ['atomicFeatures.providers', [], API.ATOMIC_PROVIDERS_LIST, {}],
  ['atomicFeatures.overview', ['/vault', { limit: 10 }], API.ATOMIC_OVERVIEW, { vaultRoot: '/vault', options: { limit: 10 } }],
  ['atomicFeatures.graph', ['/vault', { limit: 10 }], API.ATOMIC_GRAPH, { vaultRoot: '/vault', options: { limit: 10 } }],
  ['atomicFeatures.wiki', ['/vault', { limit: 10 }], API.ATOMIC_WIKI, { vaultRoot: '/vault', options: { limit: 10 } }],
  ['atomicFeatures.createWikiPage', ['/vault', { id: 'wiki-1' }], API.ATOMIC_WIKI_CREATE_PAGE, { vaultRoot: '/vault', record: { id: 'wiki-1' } }],
  ['atomicFeatures.summarize', ['/vault', 'Note.md', { provider: 'local' }], API.ATOMIC_SUMMARIZE, { vaultRoot: '/vault', relativePath: 'Note.md', providerConfig: { provider: 'local' } }],
  ['atomicFeatures.structure', ['/vault', 'Note.md', { provider: 'local' }], API.ATOMIC_STRUCTURE, { vaultRoot: '/vault', relativePath: 'Note.md', providerConfig: { provider: 'local' } }],
  ['atomicFeatures.autoNameNote', ['/vault', 'Note.md', { force: true }], API.ATOMIC_NOTE_AUTO_NAME, { vaultRoot: '/vault', relativePath: 'Note.md', options: { force: true } }],
  ['atomicFeatures.listLocalModels', ['/vault'], API.ATOMIC_MODELS_LIST_LOCAL, { vaultRoot: '/vault' }],
  ['atomicFeatures.pullModel', ['tiny', 'ollama', '/vault'], API.ATOMIC_MODELS_PULL, { vaultRoot: '/vault', id: 'tiny', provider: 'ollama' }],
  ['models.getSelection', [], API.MODEL_SELECTION_GET, {}],
  ['models.setSelection', [{ chat: 'model-a' }], API.MODEL_SELECTION_SET, { chat: 'model-a' }],
  ['models.listLocal', [], API.MODELS_LOCAL_LIST, {}],
  ['models.list', ['huggingface'], API.MODELS_LIST, { provider: 'huggingface' }],
  ['models.search', [{ provider: 'huggingface', query: 'tiny' }], API.MODELS_SEARCH, { provider: 'huggingface', query: 'tiny' }],
  ['models.searchHuggingFace', [{ query: 'tiny' }], API.MODELS_SEARCH, { provider: 'huggingface', query: 'tiny' }],
  ['models.info', [{ repoId: 'org/model' }], API.MODELS_INFO, { repoId: 'org/model' }],
  ['models.download', [{ uri: 'hf:org/model/model.gguf' }], API.MODELS_ACQUIRE, { uri: 'hf:org/model/model.gguf' }],
  ['models.activate', [{ modelRef: '/models/model.gguf' }], API.MODELS_ACTIVATE, { modelRef: '/models/model.gguf' }],
  ['models.deactivate', [{ modelRef: '/models/model.gguf' }], API.MODELS_DEACTIVATE, { modelRef: '/models/model.gguf' }],
  ['models.remove', [{ modelRef: '/models/model.gguf' }], API.MODELS_DELETE, { modelRef: '/models/model.gguf' }],
  ['models.active', ['local'], API.MODELS_ACTIVE, { provider: 'local' }],
  ['models.cancelDownload', [{ id: 'download-1' }], API.MODELS_CANCEL_DOWNLOAD, { id: 'download-1' }],
  ['models.downloadStatus', [{ id: 'download-1' }], API.MODELS_DOWNLOAD_STATUS, { id: 'download-1' }],
  ['models.refreshIndex', ['huggingface'], API.MODELS_REFRESH_INDEX, { provider: 'huggingface' }],
  ['ocr.extract', ['/tmp/image.png', { language: 'fra' }], API.OCR_EXTRACT, { imagePath: '/tmp/image.png', language: 'fra' }],
  ['sync.status', [], API.SYNC_STATUS, {}],
  ['sync.plan', [{ operations: ['pull'] }], API.SYNC_PLAN, { operations: ['pull'] }],
  ['sync.enqueue', ['pull', { remoteName: 'origin' }], API.SYNC_ENQUEUE, { operation: 'pull', payload: { remoteName: 'origin' } }],
  ['sync.run', [{ operations: ['pull'] }], API.SYNC_RUN, { operations: ['pull'] }],
  ['agents.list', [], API.AGENTS_LIST, {}],
  ['agents.register', [{ name: 'Agent' }], API.AGENTS_REGISTER, { name: 'Agent' }],
  ['agents.unregister', ['agent-1'], API.AGENTS_UNREGISTER, { id: 'agent-1' }],
  ['agents.send', ['agent-1', 'hello'], API.AGENTS_SEND, { id: 'agent-1', message: 'hello' }],
  ['plugins.list', [], API.PLUGINS_LIST, {}],
  ['plugins.set', ['plugin-1', true, { mode: 'safe' }], API.PLUGINS_SET, { id: 'plugin-1', enabled: true, config: { mode: 'safe' } }],
  ['plugins.run', ['plugin-1', { note: 'Note.md' }], API.PLUGINS_RUN, { id: 'plugin-1', input: { note: 'Note.md' } }],
  ['tasks.list', [], API.TASKS_LIST, {}],
  ['tasks.set', ['task-1', true], API.TASKS_SET, { id: 'task-1', enabled: true }],
  ['tasks.run', ['task-1'], API.TASKS_RUN, { id: 'task-1' }],
  ['mcp.listTools', [], API.MCP_TOOLS_LIST, {}],
  ['mcp.callTool', ['notes.create', { filename: 'Note.md' }], API.MCP_TOOLS_CALL, { name: 'notes.create', arguments: { filename: 'Note.md' } }],
  ['programs.list', [], API.PROGRAMS_LIST, {}],
  ['programs.set', [{ python: '/usr/bin/python3' }], API.PROGRAMS_SET, { environments: { python: '/usr/bin/python3' } }],
  ['programs.run', ['python', 'print(1)', '/vault'], API.PROGRAMS_RUN, { id: 'python', command: 'print(1)', cwd: '/vault' }]
]

describe('domain client contract matrix', () => {
  it.each(CASES)('%s dispatches its canonical action', async(path, args, action, payload) => {
    const calls = []
    const call = vi.fn(async(receivedAction, receivedPayload = {}) => {
      calls.push([receivedAction, receivedPayload])
      return {}
    })
    const client = createDomainClients(call, vi.fn(() => vi.fn()))
    const method = resolveMethod(client, path)
    expect(typeof method).toBe('function')
    await method(...args)
    expect(calls.at(-1)).toEqual([action, payload])
  })

  it('routes progress subscriptions through canonical event topics', () => {
    const subscribe = vi.fn(() => vi.fn())
    const client = createDomainClients(vi.fn(), subscribe)
    const listener = vi.fn()

    client.models.onDownloadProgress(listener)
    client.atomicFeatures.onModelPullProgress(listener)

    expect(subscribe).toHaveBeenNthCalledWith(1, EVENTS.MODELS_DOWNLOAD_PROGRESS, listener)
    expect(subscribe).toHaveBeenNthCalledWith(2, EVENTS.ATOMIC_MODEL_PULL_PROGRESS, listener)
  })

  it('routes RAG chat through vault initialization and the canonical chat action', async() => {
    const vaultPath = `/vault-${Date.now()}-${Math.random()}`
    const call = vi.fn(async(action) => {
      if (action === API.VAULTS_GET) return { activeVault: { path: vaultPath } }
      if (action === API.RAG_CHAT) return { answer: 'ok', citations: [] }
      return {}
    })
    const client = createDomainClients(call)

    await expect(client.rag.chat('hello', 4)).resolves.toMatchObject({ answer: 'ok' })
    expect(call).toHaveBeenCalledWith(API.SEARCH_INIT_VAULT, { vaultPath })
    expect(call).toHaveBeenCalledWith(API.RAG_CHAT, {
      message: 'hello', limit: 4, messages: []
    })
  })
})
