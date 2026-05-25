import fs from 'fs-extra'
import path from 'path'
import Store from 'electron-store'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  WORKSPACE_DIR,
  WORKSPACE_FILE,
  INDEX_FILE,
  createId,
  createWorkspace,
  createWelcomeMarkdown,
  isIgnoredVaultEntry,
  nextAvailableName,
  normalizeRelativePath,
  parseMarkdownMeta,
  resolveInsideVault
} from './core'
import { importGoogleKeepExport } from './googleKeepImport'
import { getSearchService, registerSearchIpc } from './search/searchIpc'
import { getSitePreviewService, registerSitePreviewIpc } from './sitePreview/sitePreviewIpc'
import {
  listAgents,
  registerAgent,
  registerElephantNoteAgentIpc,
  sendAgentMessage,
  unregisterAgent
} from './agents'
import {
  createElephantNoteApi,
  ELEPHANTNOTE_API_ACTIONS,
  registerElephantNoteApiIpc
} from './api'
import { updateMarkdownTitle } from './markdown'
import { migrateWorkspace } from './workspaceMigrations'
import { GitSyncEngine } from './sync/GitSyncEngine'
import { normalizeFeatureFlags, setFeatureFlag } from 'common/elephantnote/featureFlags'
import { normalizeAiConfig } from 'common/elephantnote/aiProviders'
import {
  ATOMIC_MODEL_CATALOG,
  ATOMIC_PLUGIN_MANIFESTS,
  PROGRAMMATIC_TASK_TEMPLATES,
  createDefaultModelSelection
} from 'common/elephantnote/atomicWorkspace'

const store = new Store({
  name: 'elephantnote',
  cwd: path.join(app.getPath('appData'), 'ElephantNote'),
  defaults: {
    vaults: [],
    activeVaultId: null,
    featureFlags: normalizeFeatureFlags(),
    aiConfig: normalizeAiConfig(),
    atomicModelSelection: createDefaultModelSelection()
  }
})

const syncEngine = new GitSyncEngine()

const getConfig = () => ({
  vaults: store.get('vaults') || [],
  activeVaultId: store.get('activeVaultId') || null,
  featureFlags: normalizeFeatureFlags(store.get('featureFlags') || {}),
  aiConfig: normalizeAiConfig(store.get('aiConfig') || {}),
  atomicModelSelection: {
    ...createDefaultModelSelection(),
    ...(store.get('atomicModelSelection') || {})
  }
})

const setConfig = (config) => {
  store.set('vaults', config.vaults)
  store.set('activeVaultId', config.activeVaultId)
  store.set('featureFlags', normalizeFeatureFlags(config.featureFlags || {}))
  store.set('aiConfig', normalizeAiConfig(config.aiConfig || {}))
  store.set('atomicModelSelection', {
    ...createDefaultModelSelection(),
    ...(config.atomicModelSelection || {})
  })
}

export const initializeVault = async(vaultRoot, now = new Date()) => {
  const root = path.resolve(vaultRoot)
  const metaDir = path.join(root, WORKSPACE_DIR)
  const workspacePath = path.join(metaDir, WORKSPACE_FILE)
  const indexPath = path.join(metaDir, INDEX_FILE)
  const gettingStartedDir = path.join(root, 'Getting Started')
  const welcomePath = path.join(gettingStartedDir, 'Welcome.md')
  const legacyWelcomePath = path.join(gettingStartedDir, 'Welcome to ElephantNote.md')

  await fs.ensureDir(metaDir)
  await fs.ensureDir(gettingStartedDir)

  if (!(await fs.pathExists(workspacePath))) {
    await fs.writeJson(workspacePath, createWorkspace(root), { spaces: 2 })
  }
  if (!(await fs.pathExists(indexPath))) {
    await fs.writeJson(indexPath, { version: 1, updatedAt: now.toISOString(), entries: [] }, { spaces: 2 })
  }
  if (!(await fs.pathExists(welcomePath))) {
    if (await fs.pathExists(legacyWelcomePath)) {
      await fs.move(legacyWelcomePath, welcomePath)
    } else {
      await fs.writeFile(welcomePath, createWelcomeMarkdown(now), 'utf8')
    }
  }

  const workspace = await readWorkspace(root)
  const gettingStarted = workspace.sidebar?.find((entry) => entry.id === 'getting-started')
  if (gettingStarted) {
    gettingStarted.title = 'Getting started'
    gettingStarted.type = 'folder'
    gettingStarted.path = 'Getting Started'
    delete gettingStarted.items
    await writeWorkspace(root, workspace)
  }

  return workspace
}

const readWorkspace = async(vaultRoot) => {
  const workspacePath = path.join(vaultRoot, WORKSPACE_DIR, WORKSPACE_FILE)
  if (!(await fs.pathExists(workspacePath))) {
    return createWorkspace(vaultRoot)
  }
  const rawWorkspace = await fs.readJson(workspacePath)
  const migratedWorkspace = migrateWorkspace(rawWorkspace)
  if (JSON.stringify(migratedWorkspace) !== JSON.stringify(rawWorkspace)) {
    await writeWorkspace(vaultRoot, migratedWorkspace)
  }
  const workspace = migratedWorkspace
  const normalizedWorkspace = normalizeWorkspaceSidebar(workspace)
  if (JSON.stringify(normalizedWorkspace.sidebar || []) !== JSON.stringify(workspace.sidebar || [])) {
    await writeWorkspace(vaultRoot, normalizedWorkspace)
  }
  return normalizedWorkspace
}

const writeWorkspace = async(vaultRoot, workspace) => {
  const workspacePath = path.join(vaultRoot, WORKSPACE_DIR, WORKSPACE_FILE)
  await fs.writeJson(workspacePath, workspace, { spaces: 2 })
}

const normalizeWorkspaceSidebar = (workspace = {}) => {
  const sidebar = []
  for (const item of workspace.sidebar || []) {
    if ((item.type === 'note' || item.type === 'folder') && item.path) {
      sidebar.push({
        ...item,
        id: item.id || createId(`${item.type}-${item.path}`),
        title: item.title || path.basename(item.path).replace(/\.md$/i, ''),
        collapsed: Boolean(item.collapsed)
      })
      continue
    }
    for (const child of item.items || []) {
      if (!child?.path) continue
      const type = child.type === 'note' ? 'note' : 'folder'
      sidebar.push({
        id: child.id || createId(`${type}-${child.path}`),
        title: child.title || path.basename(child.path).replace(/\.md$/i, ''),
        type,
        path: normalizeRelativePath(child.path),
        collapsed: false
      })
    }
  }
  return {
    ...workspace,
    sidebar
  }
}

const getActiveVault = () => {
  const config = getConfig()
  const vault = config.vaults.find((vault) => vault.id === config.activeVaultId) || null
  syncEngine.setCwd(vault?.path || '')
  return vault
}

const loadVaultPayload = async(vault) => {
  if (!vault) {
    return { ...getConfig(), activeVault: null, workspace: null, entries: [] }
  }
  await initializeVault(vault.path)
  const workspace = await readWorkspace(vault.path)
  const entries = await listDirectoryForVault(vault, '')
  return { ...getConfig(), activeVault: vault, workspace, entries }
}

const upsertVault = (vaultPath) => {
  const absolutePath = path.resolve(vaultPath)
  const config = getConfig()
  const vaultName = path.basename(absolutePath) || 'Personal'
  const existing = config.vaults.find((vault) => vault.path === absolutePath)
  const vault = existing || {
    id: createId(vaultName),
    name: vaultName,
    path: absolutePath,
    icon: 'book',
    lastOpenedAt: new Date().toISOString()
  }

  vault.lastOpenedAt = new Date().toISOString()
  if (!existing) {
    let nextId = vault.id
    let suffix = 2
    while (config.vaults.some((item) => item.id === nextId)) {
      nextId = `${vault.id}-${suffix}`
      suffix += 1
    }
    vault.id = nextId
    config.vaults.push(vault)
  }
  config.activeVaultId = vault.id
  setConfig(config)
  return vault
}

const listDirectoryForVault = async(vault, relativePath = '') => {
  const directory = resolveInsideVault(vault.path, relativePath)
  const dirents = await fs.readdir(directory, { withFileTypes: true })
  const entries = []

  for (const dirent of dirents) {
    if (isIgnoredVaultEntry(dirent.name)) continue
    const fullPath = path.join(directory, dirent.name)
    const relative = path.relative(vault.path, fullPath)
    const stats = await fs.stat(fullPath)

    if (dirent.isDirectory()) {
      const childNames = await fs.readdir(fullPath)
      entries.push({
        kind: 'folder',
        title: dirent.name,
        path: relative,
        noteCount: childNames.filter((name) => name.toLowerCase().endsWith('.md')).length,
        updatedAt: stats.mtime.toISOString()
      })
    } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.md')) {
      const markdown = await fs.readFile(fullPath, 'utf8')
      entries.push({
        kind: 'note',
        path: relative,
        filename: dirent.name,
        updatedAt: stats.mtime.toISOString(),
        ...parseMarkdownMeta(markdown, dirent.name)
      })
    }
  }

  return entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

const createNote = async({ relativePath = '' } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const directory = resolveInsideVault(vault.path, relativePath)
  await fs.ensureDir(directory)
  const filename = nextAvailableName('Untitled.md', (name) => fs.existsSync(path.join(directory, name)))
  const fullPath = path.join(directory, filename)
  const now = new Date().toISOString()
  await fs.writeFile(
    fullPath,
    `---\ntitle: "Untitled"\ntype: "note"\ntags: []\ncreatedAt: "${now}"\nupdatedAt: "${now}"\n---\n\n# Untitled\n`,
    'utf8'
  )
  getSearchService().indexFile(fullPath).catch(() => {})
  return {
    note: { path: path.relative(vault.path, fullPath), fullPath },
    entries: await listDirectoryForVault(vault, relativePath)
  }
}

const createFolder = async({ relativePath = '' } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const directory = resolveInsideVault(vault.path, relativePath)
  await fs.ensureDir(directory)
  const folderName = nextAvailableName('New Folder', (name) => fs.existsSync(path.join(directory, name)))
  const fullPath = path.join(directory, folderName)
  await fs.ensureDir(fullPath)
  return {
    folder: { path: path.relative(vault.path, fullPath), fullPath },
    entries: await listDirectoryForVault(vault, relativePath)
  }
}

const getSidebarEntryType = async(vault, relativePath, requestedType) => {
  if (requestedType === 'note' || requestedType === 'folder') return requestedType
  const stats = await fs.stat(resolveInsideVault(vault.path, relativePath))
  return stats.isDirectory() ? 'folder' : 'note'
}

const attachSidebarEntry = async({ relativePath, title, type } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) throw new Error('A path is required.')
  const fullPath = resolveInsideVault(vault.path, normalizedPath)
  if (!(await fs.pathExists(fullPath))) throw new Error('Entry not found.')
  const entryType = await getSidebarEntryType(vault, normalizedPath, type)
  const workspace = await readWorkspace(vault.path)
  workspace.sidebar = (workspace.sidebar || []).filter((item) => item.path !== normalizedPath)
  const fallbackTitle = path.basename(normalizedPath).replace(/\.md$/i, '')
  workspace.sidebar.push({
    id: createId(`${entryType}-${normalizedPath}`),
    title: String(title || fallbackTitle),
    type: entryType,
    path: normalizedPath,
    collapsed: false
  })
  await writeWorkspace(vault.path, workspace)
  return { workspace, entries: await listDirectoryForVault(vault, path.dirname(normalizedPath) === '.' ? '' : path.dirname(normalizedPath)) }
}

const detachSidebarEntry = async({ relativePath } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) throw new Error('A path is required.')
  const workspace = await readWorkspace(vault.path)
  workspace.sidebar = (workspace.sidebar || []).filter((item) => item.path !== normalizedPath)
  await writeWorkspace(vault.path, workspace)
  return { workspace, entries: await listDirectoryForVault(vault, '') }
}

const replaceWorkspacePathPrefix = (workspace, oldRelativePath, newRelativePath) => {
  const oldPath = normalizeRelativePath(oldRelativePath)
  const newPath = normalizeRelativePath(newRelativePath)
  if (!oldPath || !newPath) return workspace

  for (const category of workspace.sidebar || []) {
    if (category.path === oldPath) {
      category.path = newPath
      category.title = path.basename(newPath).replace(/\.md$/i, '')
    } else if (category.path?.startsWith(`${oldPath}${path.sep}`) || category.path?.startsWith(`${oldPath}/`)) {
      category.path = `${newPath}${category.path.slice(oldPath.length)}`
    }
    for (const item of category.items || []) {
      const itemPath = normalizeRelativePath(item.path)
      if (itemPath === oldPath) {
        item.path = newPath
        item.title = path.basename(newPath).replace(/\.md$/i, '')
      } else if (itemPath.startsWith(`${oldPath}${path.sep}`) || itemPath.startsWith(`${oldPath}/`)) {
        item.path = `${newPath}${itemPath.slice(oldPath.length)}`
      }
    }
  }
  return workspace
}

const removeWorkspacePathPrefix = (workspace, relativePath) => {
  const targetPath = normalizeRelativePath(relativePath)
  if (!targetPath) return workspace
  workspace.sidebar = (workspace.sidebar || [])
    .map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => {
        const itemPath = normalizeRelativePath(item.path)
        return itemPath !== targetPath && !itemPath.startsWith(`${targetPath}${path.sep}`) && !itemPath.startsWith(`${targetPath}/`)
      })
    }))
    .filter((category) => {
      const categoryPath = normalizeRelativePath(category.path)
      if (categoryPath === targetPath || categoryPath.startsWith(`${targetPath}${path.sep}`) || categoryPath.startsWith(`${targetPath}/`)) {
        return false
      }
      return category.items?.length || category.type || category.id === 'getting-started'
    })
  return workspace
}

const renameEntry = async({ relativePath, title } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const normalizedPath = normalizeRelativePath(relativePath)
  const normalizedTitle = String(title || '').trim().replace(/[\\/]/g, '-')
  if (!normalizedPath || !normalizedTitle) throw new Error('A path and a new name are required.')

  const source = resolveInsideVault(vault.path, normalizedPath)
  if (!(await fs.pathExists(source))) throw new Error('Entry not found.')

  const stats = await fs.stat(source)
  const extension = stats.isFile() ? path.extname(source) : ''
  const nextName = stats.isFile() && !path.extname(normalizedTitle) ? `${normalizedTitle}${extension}` : normalizedTitle
  const target = resolveInsideVault(vault.path, path.join(path.dirname(normalizedPath), nextName))
  if (source === target) {
    return {
      workspace: await readWorkspace(vault.path),
      entries: await listDirectoryForVault(vault, path.dirname(normalizedPath) === '.' ? '' : path.dirname(normalizedPath))
    }
  }
  if (await fs.pathExists(target)) throw new Error('An item with this name already exists.')

  await fs.move(source, target)
  if (stats.isFile() && path.extname(source).toLowerCase() === '.md') {
    const currentMarkdown = await fs.readFile(target, 'utf8')
    const nextMarkdown = updateMarkdownTitle(currentMarkdown, normalizedTitle)
    if (nextMarkdown !== currentMarkdown) {
      await fs.writeFile(target, nextMarkdown, 'utf8')
    }
  }
  getSearchService().deleteFile(source).catch(() => {})
  getSearchService().indexFile(target).catch(() => {})
  const workspace = replaceWorkspacePathPrefix(await readWorkspace(vault.path), normalizedPath, path.relative(vault.path, target))
  await writeWorkspace(vault.path, workspace)

  const parentPath = path.dirname(normalizedPath) === '.' ? '' : path.dirname(normalizedPath)
  return {
    workspace,
    entries: await listDirectoryForVault(vault, parentPath)
  }
}

const deleteEntry = async({ relativePath } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) throw new Error('A path is required.')

  const target = resolveInsideVault(vault.path, normalizedPath)
  if (!(await fs.pathExists(target))) throw new Error('Entry not found.')
  await fs.remove(target)
  getSearchService().deleteFile(target).catch(() => {})

  const workspace = removeWorkspacePathPrefix(await readWorkspace(vault.path), normalizedPath)
  await writeWorkspace(vault.path, workspace)

  const parentPath = path.dirname(normalizedPath) === '.' ? '' : path.dirname(normalizedPath)
  return {
    workspace,
    entries: await listDirectoryForVault(vault, parentPath)
  }
}

const importGoogleKeep = async(event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')

  const exportSelection = await dialog.showOpenDialog(win, {
    title: 'Select Google Keep export',
    properties: ['openFile'],
    filters: [{ name: 'Google Keep export', extensions: ['zip', 'json'] }]
  })

  if (exportSelection.canceled || !exportSelection.filePaths?.[0]) {
    return { canceled: true }
  }

  const destinationSelection = await dialog.showOpenDialog(win, {
    title: 'Choose destination folder inside the vault',
    defaultPath: vault.path,
    properties: ['openDirectory', 'createDirectory']
  })

  if (destinationSelection.canceled || !destinationSelection.filePaths?.[0]) {
    return { canceled: true }
  }

  const selectedDestination = destinationSelection.filePaths[0]
  const destinationPath = resolveInsideVault(vault.path, path.relative(vault.path, selectedDestination))
  const result = await importGoogleKeepExport({
    sourcePath: exportSelection.filePaths[0],
    destinationPath
  })
  await Promise.all(
    (result.files || []).map((filePath) =>
      getSearchService().indexFile(filePath).catch(() => {})
    )
  )

  win.webContents.send('mt::show-notification', {
    title: 'Google Keep import complete',
    message: `Imported ${result.imported} note${result.imported === 1 ? '' : 's'} into ${path.relative(vault.path, destinationPath) || 'the vault root'}.`,
    type: 'info',
    time: 8000
  })

  return {
    canceled: false,
    entries: await listDirectoryForVault(vault, path.relative(vault.path, destinationPath)),
    ...result
  }
}

const importGoogleKeepFromPaths = async({ sourcePath, destinationRelativePath = '' } = {}) => {
  const vault = getActiveVault()
  if (!vault) throw new Error('No active ElephantNote vault.')
  const destinationPath = resolveInsideVault(vault.path, destinationRelativePath)
  const result = await importGoogleKeepExport({ sourcePath, destinationPath })
  await Promise.all(
    (result.files || []).map((filePath) =>
      getSearchService().indexFile(filePath).catch(() => {})
    )
  )
  return {
    canceled: false,
    entries: await listDirectoryForVault(vault, path.relative(vault.path, destinationPath)),
    ...result
  }
}

const getApiWindowId = (context = {}) => {
  if (context.windowId !== undefined && context.windowId !== null) return context.windowId
  const webContents = context.event?.sender
  if (!webContents) return null
  return BrowserWindow.fromWebContents(webContents)?.id ?? null
}

const createElephantNoteMainApi = () => {
  const searchService = getSearchService()
  const sitePreviewService = getSitePreviewService()
  return createElephantNoteApi({
    handlers: {
      [ELEPHANTNOTE_API_ACTIONS.VAULTS_GET]: async() => loadVaultPayload(getActiveVault()),
      [ELEPHANTNOTE_API_ACTIONS.VAULTS_SELECT]: async(_payload, { event }) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const result = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled || !result.filePaths?.[0]) {
          return { canceled: true }
        }
        await initializeVault(result.filePaths[0])
        const vault = upsertVault(result.filePaths[0])
        return { canceled: false, ...(await loadVaultPayload(vault)) }
      },
      [ELEPHANTNOTE_API_ACTIONS.VAULTS_SET_ACTIVE]: async({ vaultId }) => {
        const config = getConfig()
        const vault = config.vaults.find((item) => item.id === vaultId)
        if (!vault) throw new Error('Unknown ElephantNote vault.')
        config.activeVaultId = vault.id
        setConfig(config)
        return loadVaultPayload(vault)
      },
      [ELEPHANTNOTE_API_ACTIONS.DIRECTORY_LIST]: async({ relativePath = '' } = {}) => {
        const vault = getActiveVault()
        if (!vault) throw new Error('No active ElephantNote vault.')
        return listDirectoryForVault(vault, normalizeRelativePath(relativePath))
      },
      [ELEPHANTNOTE_API_ACTIONS.NOTES_CREATE]: async(payload) => createNote(payload),
      [ELEPHANTNOTE_API_ACTIONS.FOLDERS_CREATE]: async(payload) => createFolder(payload),
      [ELEPHANTNOTE_API_ACTIONS.SIDEBAR_ATTACH]: async(payload) => attachSidebarEntry(payload),
      [ELEPHANTNOTE_API_ACTIONS.SIDEBAR_DETACH]: async(payload) => detachSidebarEntry(payload),
      [ELEPHANTNOTE_API_ACTIONS.ENTRIES_RENAME]: async(payload) => renameEntry(payload),
      [ELEPHANTNOTE_API_ACTIONS.ENTRIES_DELETE]: async(payload) => deleteEntry(payload),
      [ELEPHANTNOTE_API_ACTIONS.IMPORT_GOOGLE_KEEP]: async(_payload, { event }) => importGoogleKeep(event),
      [ELEPHANTNOTE_API_ACTIONS.IMPORT_GOOGLE_KEEP_FROM_PATHS]: async(payload) => importGoogleKeepFromPaths(payload),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_INIT_VAULT]: async({ vaultPath }, context) =>
        searchService.registerWindowVault(getApiWindowId(context), vaultPath),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_QUERY]: async(payload, context) =>
        searchService.search(payload, getApiWindowId(context)),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_STATUS]: async(_payload, context) =>
        searchService.getStatus(getApiWindowId(context)),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_INSPECT]: async(_payload, context) =>
        searchService.inspectIndex(getApiWindowId(context)),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_REBUILD]: async(_payload, context) =>
        searchService.rebuildIndex(getApiWindowId(context)),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_CLEAR]: async(_payload, context) =>
        searchService.clearIndex(getApiWindowId(context)),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_DISABLE]: async() => searchService.disable(),
      [ELEPHANTNOTE_API_ACTIONS.SEARCH_ENABLE]: async() => searchService.enable(),
      [ELEPHANTNOTE_API_ACTIONS.SITES_PREVIEW_FOLDER]: async(payload) =>
        sitePreviewService.previewFolder(payload),
      [ELEPHANTNOTE_API_ACTIONS.SITES_BUILD_FOLDER]: async(payload) =>
        sitePreviewService.buildFolder(payload),
      [ELEPHANTNOTE_API_ACTIONS.SITES_STOP]: async({ siteId }) =>
        sitePreviewService.stopPreview(siteId),
      [ELEPHANTNOTE_API_ACTIONS.SITES_STATUS]: async({ siteId }) =>
        sitePreviewService.getStatus(siteId),
      [ELEPHANTNOTE_API_ACTIONS.SITES_OPEN_EXTERNAL]: async({ url }) =>
        sitePreviewService.openExternal(url),
      [ELEPHANTNOTE_API_ACTIONS.AGENTS_LIST]: async() => listAgents(),
      [ELEPHANTNOTE_API_ACTIONS.AGENTS_REGISTER]: async(payload) => registerAgent(payload),
      [ELEPHANTNOTE_API_ACTIONS.AGENTS_UNREGISTER]: async({ id }) => unregisterAgent(id),
      [ELEPHANTNOTE_API_ACTIONS.AGENTS_SEND]: async(payload) => sendAgentMessage(payload),
      [ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_GET]: async() => getConfig().aiConfig,
      [ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_SET]: async(payload) => {
        const config = getConfig()
        config.aiConfig = normalizeAiConfig(payload)
        setConfig(config)
        if (config.aiConfig.codexLinkEnabled && config.aiConfig.preset === 'codex') {
          registerAgent({
            id: 'codex',
            name: 'Codex',
            transport: config.aiConfig.transport,
            endpoint: config.aiConfig.endpoint,
            model: config.aiConfig.model,
            apiKey: config.aiConfig.apiKey,
            capabilities: ['chat', 'code']
          })
        }
        return config.aiConfig
      },
      [ELEPHANTNOTE_API_ACTIONS.FEATURES_GET]: async() => getConfig().featureFlags,
      [ELEPHANTNOTE_API_ACTIONS.FEATURES_SET]: async({ key, enabled }) => {
        const config = getConfig()
        config.featureFlags = setFeatureFlag(config.featureFlags, key, enabled)
        setConfig(config)
        return config.featureFlags
      },
      [ELEPHANTNOTE_API_ACTIONS.ATOMIC_CATALOG_GET]: async() => ({
        models: ATOMIC_MODEL_CATALOG,
        plugins: ATOMIC_PLUGIN_MANIFESTS,
        tasks: PROGRAMMATIC_TASK_TEMPLATES
      }),
      [ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_GET]: async() => getConfig().atomicModelSelection,
      [ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_SET]: async(payload) => {
        const config = getConfig()
        config.atomicModelSelection = {
          ...createDefaultModelSelection(),
          ...payload
        }
        setConfig(config)
        return getConfig().atomicModelSelection
      },
      [ELEPHANTNOTE_API_ACTIONS.PLUGINS_LIST]: async() => ATOMIC_PLUGIN_MANIFESTS,
      [ELEPHANTNOTE_API_ACTIONS.TASKS_LIST]: async() => PROGRAMMATIC_TASK_TEMPLATES,
      [ELEPHANTNOTE_API_ACTIONS.SYNC_STATUS]: async() => syncEngine.status(),
      [ELEPHANTNOTE_API_ACTIONS.SYNC_ENQUEUE]: async({ operation, payload = {} }) =>
        syncEngine.enqueue({ operation, payload }),
      [ELEPHANTNOTE_API_ACTIONS.SYNC_RUN]: async() => syncEngine.run()
    }
  })
}

export const registerElephantNoteIpc = () => {
  const api = createElephantNoteMainApi()
  registerElephantNoteApiIpc({ ipcMain, api })
  registerSearchIpc()
  registerSitePreviewIpc()
  registerElephantNoteAgentIpc()

  ipcMain.handle('elephantnote:getVaults', async() => api.call(ELEPHANTNOTE_API_ACTIONS.VAULTS_GET))
  ipcMain.handle('elephantnote:selectVault', async(event) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.VAULTS_SELECT, {}, { event }))
  ipcMain.handle('elephantnote:setActiveVault', async(_event, vaultId) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.VAULTS_SET_ACTIVE, { vaultId }))
  ipcMain.handle('elephantnote:listDirectory', async(_event, relativePath = '') =>
    api.call(ELEPHANTNOTE_API_ACTIONS.DIRECTORY_LIST, { relativePath }))
  ipcMain.handle('elephantnote:createNote', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.NOTES_CREATE, payload))
  ipcMain.handle('elephantnote:createFolder', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.FOLDERS_CREATE, payload))
  ipcMain.handle('elephantnote:attachSidebarEntry', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.SIDEBAR_ATTACH, payload))
  ipcMain.handle('elephantnote:detachSidebarEntry', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.SIDEBAR_DETACH, payload))
  ipcMain.handle('elephantnote:importGoogleKeep', async(event) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.IMPORT_GOOGLE_KEEP, {}, { event }))
  ipcMain.handle('elephantnote:renameEntry', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.ENTRIES_RENAME, payload))
  ipcMain.handle('elephantnote:deleteEntry', async(_event, payload) =>
    api.call(ELEPHANTNOTE_API_ACTIONS.ENTRIES_DELETE, payload))
}
