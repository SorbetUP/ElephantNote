const STORAGE_PREFIX = 'elephantnote:tauri:'
const CONFIG_KEY = `${STORAGE_PREFIX}vault-config`
const WORKSPACE_DIR = '.elephantnote'
const WORKSPACE_FILE = 'workspace.json'
const INDEX_FILE = 'index.json'
const CALENDAR_FILE = 'calendar.json'
const SOURCES_FILE = 'sources.json'
const WIKI_FILE = 'wiki.json'
const DEFAULT_NOTE_NAME = 'Untitled.md'

const getFs = (target = globalThis) => target?.__TAURI__?.fs || null
const getPath = (target = globalThis) => target?.path || null

const nowIso = () => new Date().toISOString()
const normalizeSlashes = (value = '') => String(value || '').replace(/\\/g, '/')
const normalizeRelativePath = (relativePath = '') => {
  const parts = []
  for (const part of normalizeSlashes(relativePath).split('/')) {
    if (!part || part === '.' || part === '..') continue
    parts.push(part)
  }
  return parts.join('/')
}
const createId = (value = '') => {
  const id = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || 'vault'
}
const basename = (pathname = '') => {
  const value = normalizeSlashes(pathname).replace(/\/+$/, '')
  return value.split('/').filter(Boolean).at(-1) || value || ''
}
const dirname = (pathname = '') => {
  const value = normalizeSlashes(pathname).replace(/\/+$/, '')
  const index = value.lastIndexOf('/')
  if (index <= 0) return ''
  return value.slice(0, index)
}
const stripMarkdownExtension = (value = '') => String(value || '').replace(/\.md$/i, '')
const joinPath = (target, ...parts) => {
  const path = getPath(target)
  if (path?.join) return path.join(...parts)
  return normalizeSlashes(parts.filter(Boolean).join('/')).replace(/\/+/, '/')
}
const isIgnoredVaultEntry = (name = '') => (
  name === WORKSPACE_DIR ||
  name === '.git' ||
  name === 'node_modules' ||
  name.startsWith('.') ||
  name.endsWith('~') ||
  name.endsWith('.tmp')
)

const encodeText = (value = '') => new TextEncoder().encode(String(value || ''))
const decodeText = (data) => {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  if (Array.isArray(data)) return new TextDecoder().decode(new Uint8Array(data))
  return String(data ?? '')
}

const readStoredJson = (target, key, fallback) => {
  try {
    const raw = target?.localStorage?.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
const writeStoredJson = (target, key, value) => {
  try {
    target?.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    if (!target.__TAURI_BRIDGE_STORAGE__) target.__TAURI_BRIDGE_STORAGE__ = new Map()
    target.__TAURI_BRIDGE_STORAGE__.set(key, JSON.stringify(value))
  }
  return value
}

const pathExists = async(fs, pathname) => {
  if (!fs || !pathname) return false
  if (fs.exists) {
    try { return await fs.exists(pathname) } catch {}
  }
  if (fs.stat) {
    try { await fs.stat(pathname); return true } catch {}
  }
  return false
}
const ensureDir = async(fs, pathname) => {
  if (!fs || !pathname) return
  try {
    await fs.mkdir?.(pathname, { recursive: true })
  } catch {
    try { await fs.mkdir?.(pathname) } catch {}
  }
}
const readTextFile = async(fs, pathname, fallback = '') => {
  if (!fs || !pathname) return fallback
  try {
    if (fs.readTextFile) return await fs.readTextFile(pathname)
    if (fs.readFile) return decodeText(await fs.readFile(pathname))
  } catch {}
  return fallback
}
const writeTextFile = async(fs, pathname, content = '') => {
  if (!fs || !pathname) return false
  await ensureDir(fs, dirname(pathname))
  if (fs.writeTextFile) {
    await fs.writeTextFile(pathname, String(content || ''))
    return true
  }
  if (fs.writeFile) {
    await fs.writeFile(pathname, encodeText(content))
    return true
  }
  return false
}
const readJsonFile = async(fs, pathname, fallback) => {
  const raw = await readTextFile(fs, pathname, '')
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
const writeJsonFile = async(fs, pathname, value) => writeTextFile(fs, pathname, JSON.stringify(value, null, 2))
const readDir = async(fs, pathname) => {
  try { return await fs?.readDir?.(pathname) || [] } catch { return [] }
}
const statPath = async(fs, pathname) => {
  try { return await fs?.stat?.(pathname) || null } catch { return null }
}
const isDirectoryEntry = (entry) => Boolean(entry?.isDirectory || entry?.children)
const isFileEntry = (entry) => Boolean(entry?.isFile || (!entry?.isDirectory && !entry?.children))
const getEntryName = (entry) => entry?.name || basename(entry?.path || '')
const getEntryPath = (target, parent, entry) => entry?.path || joinPath(target, parent, getEntryName(entry))

const createWorkspace = (vaultRoot) => ({
  version: 1,
  vaultName: basename(vaultRoot) || 'Personal',
  sidebar: [
    {
      id: 'getting-started',
      title: 'Getting started',
      type: 'folder',
      path: 'Getting Started',
      collapsed: false
    }
  ]
})
const createWelcomeMarkdown = () => {
  const timestamp = nowIso()
  return `---\ntitle: "Welcome"\ntype: "note"\ntags: ["getting-started"]\ncreatedAt: "${timestamp}"\nupdatedAt: "${timestamp}"\n---\n\n# Welcome to ElephantNote\n\nWelcome to ElephantNote running through the Tauri shell.\n\n- Your vault is a normal folder.\n- Notes are Markdown files.\n- Heavy AI/OCR can stay desktop-side while mobile shares the same frontend.\n`
}
const parseMarkdownMeta = (markdown = '', fallbackName = 'Untitled') => {
  const frontmatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const meta = {}
  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/)
      if (!match) continue
      const [, key, raw] = match
      const value = raw.trim()
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = value
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim().replace(/^["']|["']$/g, '').replace(/^#+/, ''))
          .filter(Boolean)
      } else {
        meta[key] = value.replace(/^["']|["']$/g, '')
      }
    }
  }
  const body = frontmatterMatch ? markdown.slice(frontmatterMatch[0].length) : markdown
  const title = meta.title || body.match(/^#\s+(.+)$/m)?.[1] || stripMarkdownExtension(basename(fallbackName)) || 'Untitled'
  const excerpt = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
  return {
    title,
    type: meta.type || 'note',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    createdAt: meta.createdAt || '',
    updatedAt: meta.updatedAt || '',
    excerpt,
    coverImage: body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] || ''
  }
}

const getConfig = (target) => readStoredJson(target, CONFIG_KEY, { vaults: [], activeVaultId: null })
const setConfig = (target, config) => writeStoredJson(target, CONFIG_KEY, {
  vaults: Array.isArray(config?.vaults) ? config.vaults : [],
  activeVaultId: config?.activeVaultId || null
})
const getActiveVault = (target) => {
  const config = getConfig(target)
  return config.vaults.find((vault) => vault.id === config.activeVaultId) || null
}
const upsertVault = (target, vaultPath) => {
  const config = getConfig(target)
  const absolutePath = normalizeSlashes(vaultPath)
  const vaultName = basename(absolutePath) || 'Personal'
  let vault = config.vaults.find((item) => item.path === absolutePath)
  if (!vault) {
    let id = createId(vaultName)
    let suffix = 2
    while (config.vaults.some((item) => item.id === id)) {
      id = `${createId(vaultName)}-${suffix}`
      suffix += 1
    }
    vault = { id, name: vaultName, path: absolutePath, icon: '', lastOpenedAt: nowIso() }
    config.vaults.push(vault)
  }
  vault.lastOpenedAt = nowIso()
  config.activeVaultId = vault.id
  setConfig(target, config)
  return vault
}
const resolveInsideVault = (target, vaultRoot, relativePath = '') => {
  const normalized = normalizeRelativePath(relativePath)
  return normalized ? joinPath(target, vaultRoot, normalized) : vaultRoot
}
const workspacePath = (target, vaultRoot, file = WORKSPACE_FILE) => joinPath(target, vaultRoot, WORKSPACE_DIR, file)

const initializeVault = async(target, vaultRoot) => {
  const fs = getFs(target)
  if (!fs || !vaultRoot) throw new Error('Tauri file system API is unavailable.')
  const metaDir = joinPath(target, vaultRoot, WORKSPACE_DIR)
  const gettingStartedDir = joinPath(target, vaultRoot, 'Getting Started')
  const welcomePath = joinPath(target, gettingStartedDir, 'Welcome.md')
  await ensureDir(fs, metaDir)
  await ensureDir(fs, gettingStartedDir)
  if (!(await pathExists(fs, workspacePath(target, vaultRoot)))) {
    await writeJsonFile(fs, workspacePath(target, vaultRoot), createWorkspace(vaultRoot))
  }
  if (!(await pathExists(fs, workspacePath(target, vaultRoot, INDEX_FILE)))) {
    await writeJsonFile(fs, workspacePath(target, vaultRoot, INDEX_FILE), { version: 1, updatedAt: nowIso(), entries: [] })
  }
  if (!(await pathExists(fs, workspacePath(target, vaultRoot, CALENDAR_FILE)))) {
    await writeJsonFile(fs, workspacePath(target, vaultRoot, CALENDAR_FILE), { version: 1, updatedAt: nowIso(), events: [] })
  }
  if (!(await pathExists(fs, workspacePath(target, vaultRoot, SOURCES_FILE)))) {
    await writeJsonFile(fs, workspacePath(target, vaultRoot, SOURCES_FILE), { version: 1, updatedAt: nowIso(), sources: [] })
  }
  if (!(await pathExists(fs, workspacePath(target, vaultRoot, WIKI_FILE)))) {
    await writeJsonFile(fs, workspacePath(target, vaultRoot, WIKI_FILE), { version: 1, updatedAt: nowIso(), records: [] })
  }
  if (!(await pathExists(fs, welcomePath))) {
    await writeTextFile(fs, welcomePath, createWelcomeMarkdown())
  }
}
const readWorkspace = async(target, vaultRoot) => readJsonFile(getFs(target), workspacePath(target, vaultRoot), createWorkspace(vaultRoot))
const writeWorkspace = async(target, vaultRoot, workspace) => writeJsonFile(getFs(target), workspacePath(target, vaultRoot), workspace)

const listDirectoryForVault = async(target, vault, relativePath = '') => {
  const fs = getFs(target)
  if (!vault) return []
  const directory = resolveInsideVault(target, vault.path, relativePath)
  const entries = []
  for (const entry of await readDir(fs, directory)) {
    const name = getEntryName(entry)
    if (!name || isIgnoredVaultEntry(name)) continue
    const fullPath = getEntryPath(target, directory, entry)
    const relative = normalizeRelativePath([relativePath, name].filter(Boolean).join('/'))
    const stat = await statPath(fs, fullPath)
    const isDir = isDirectoryEntry(entry) || stat?.isDirectory
    const isFile = isFileEntry(entry) || stat?.isFile
    if (isDir) {
      const children = await readDir(fs, fullPath)
      entries.push({
        kind: 'folder',
        title: name,
        path: relative,
        noteCount: children.filter((child) => getEntryName(child).toLowerCase().endsWith('.md')).length,
        updatedAt: stat?.mtime || stat?.modifiedAt || nowIso()
      })
    } else if (isFile && name.toLowerCase().endsWith('.md')) {
      const markdown = await readTextFile(fs, fullPath, '')
      entries.push({
        kind: 'note',
        path: relative,
        filename: name,
        updatedAt: stat?.mtime || stat?.modifiedAt || nowIso(),
        ...parseMarkdownMeta(markdown, name)
      })
    }
  }
  return entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}
const loadVaultPayload = async(target, vault) => {
  const config = getConfig(target)
  if (!vault) return { ...config, activeVault: null, workspace: null, entries: [] }
  await initializeVault(target, vault.path)
  return {
    ...getConfig(target),
    activeVault: vault,
    workspace: await readWorkspace(target, vault.path),
    entries: await listDirectoryForVault(target, vault, '')
  }
}
const nextAvailableName = async(target, directory, baseName = DEFAULT_NOTE_NAME) => {
  const fs = getFs(target)
  if (!(await pathExists(fs, joinPath(target, directory, baseName)))) return baseName
  const extMatch = baseName.match(/(\.[^./\\]+)$/)
  const extension = extMatch?.[1] || ''
  const stem = extension ? baseName.slice(0, -extension.length) : baseName
  let index = 2
  while (await pathExists(fs, joinPath(target, directory, `${stem} ${index}${extension}`))) index += 1
  return `${stem} ${index}${extension}`
}

const createBridge = (target) => ({
  api: {
    describe: async() => ({ runtime: 'tauri', mode: 'legacy-bridge', actions: [] })
  },
  getVaults: async() => loadVaultPayload(target, getActiveVault(target)),
  selectVault: async() => {
    const folder = await target.__TAURI_SELECT_DIRECTORY__?.() || null
    if (!folder) return loadVaultPayload(target, getActiveVault(target))
    const vault = upsertVault(target, Array.isArray(folder) ? folder[0] : folder)
    return loadVaultPayload(target, vault)
  },
  setActiveVault: async(vaultId) => {
    const config = getConfig(target)
    config.activeVaultId = vaultId
    setConfig(target, config)
    return loadVaultPayload(target, getActiveVault(target))
  },
  setVaultIcon: async({ vaultId, icon = '' } = {}) => {
    const config = getConfig(target)
    const vault = config.vaults.find((item) => item.id === vaultId)
    if (vault) vault.icon = icon
    setConfig(target, config)
    return loadVaultPayload(target, vault || getActiveVault(target))
  },
  setVaultName: async({ vaultId, name = '' } = {}) => {
    const config = getConfig(target)
    const vault = config.vaults.find((item) => item.id === vaultId)
    if (vault && String(name).trim()) vault.name = String(name).trim()
    setConfig(target, config)
    return loadVaultPayload(target, vault || getActiveVault(target))
  },
  removeVault: async({ vaultId } = {}) => {
    const config = getConfig(target)
    config.vaults = config.vaults.filter((item) => item.id !== vaultId)
    if (config.activeVaultId === vaultId) config.activeVaultId = config.vaults[0]?.id || null
    setConfig(target, config)
    return loadVaultPayload(target, getActiveVault(target))
  },
  listDirectory: async(relativePath = '') => listDirectoryForVault(target, getActiveVault(target), relativePath),
  createNote: async({ relativePath = '', filename = '', title = '' } = {}) => {
    const vault = getActiveVault(target)
    if (!vault) throw new Error('No active ElephantNote vault.')
    const fs = getFs(target)
    const directory = resolveInsideVault(target, vault.path, relativePath)
    await ensureDir(fs, directory)
    const finalName = filename || await nextAvailableName(target, directory, DEFAULT_NOTE_NAME)
    const fullPath = joinPath(target, directory, finalName)
    const noteTitle = title || stripMarkdownExtension(finalName) || 'Untitled'
    const timestamp = nowIso()
    if (!(await pathExists(fs, fullPath))) {
      await writeTextFile(fs, fullPath, `---\ntitle: "${noteTitle.replace(/"/g, '\\"')}"\ntype: "note"\ntags: []\ncreatedAt: "${timestamp}"\nupdatedAt: "${timestamp}"\n---\n\n# ${noteTitle}\n`)
    }
    return {
      note: { path: normalizeRelativePath([relativePath, finalName].filter(Boolean).join('/')), fullPath, title: noteTitle },
      entries: await listDirectoryForVault(target, vault, relativePath)
    }
  },
  createFolder: async({ relativePath = '' } = {}) => {
    const vault = getActiveVault(target)
    if (!vault) throw new Error('No active ElephantNote vault.')
    const directory = resolveInsideVault(target, vault.path, relativePath)
    const folderName = await nextAvailableName(target, directory, 'New Folder')
    const fullPath = joinPath(target, directory, folderName)
    await ensureDir(getFs(target), fullPath)
    return {
      folder: { path: normalizeRelativePath([relativePath, folderName].filter(Boolean).join('/')), fullPath },
      entries: await listDirectoryForVault(target, vault, relativePath)
    }
  },
  attachSidebarEntry: async({ relativePath, title, type } = {}) => {
    const vault = getActiveVault(target)
    if (!vault) throw new Error('No active ElephantNote vault.')
    const workspace = await readWorkspace(target, vault.path)
    const normalized = normalizeRelativePath(relativePath)
    workspace.sidebar = (workspace.sidebar || []).filter((item) => item.path !== normalized)
    workspace.sidebar.push({
      id: createId(`${type || 'entry'}-${normalized}`),
      title: title || stripMarkdownExtension(basename(normalized)),
      type: type || (normalized.toLowerCase().endsWith('.md') ? 'note' : 'folder'),
      path: normalized,
      collapsed: false
    })
    await writeWorkspace(target, vault.path, workspace)
    return { workspace, entries: await listDirectoryForVault(target, vault, dirname(normalized)) }
  },
  detachSidebarEntry: async({ relativePath } = {}) => {
    const vault = getActiveVault(target)
    if (!vault) throw new Error('No active ElephantNote vault.')
    const workspace = await readWorkspace(target, vault.path)
    const normalized = normalizeRelativePath(relativePath)
    workspace.sidebar = (workspace.sidebar || []).filter((item) => item.path !== normalized)
    await writeWorkspace(target, vault.path, workspace)
    return { workspace, entries: await listDirectoryForVault(target, vault, '') }
  },
  renameEntry: async({ relativePath, title } = {}) => {
    const vault = getActiveVault(target)
    const fs = getFs(target)
    const normalized = normalizeRelativePath(relativePath)
    const source = resolveInsideVault(target, vault.path, normalized)
    const parent = dirname(normalized)
    const extension = normalized.toLowerCase().endsWith('.md') && !String(title).toLowerCase().endsWith('.md') ? '.md' : ''
    const targetPath = resolveInsideVault(target, vault.path, [parent, `${String(title).replace(/[\\/]/g, '-')}${extension}`].filter(Boolean).join('/'))
    await fs?.rename?.(source, targetPath)
    return loadVaultPayload(target, vault)
  },
  moveEntry: async({ relativePath, targetDirectoryPath = '' } = {}) => {
    const vault = getActiveVault(target)
    const fs = getFs(target)
    const source = resolveInsideVault(target, vault.path, relativePath)
    const targetPath = resolveInsideVault(target, vault.path, [targetDirectoryPath, basename(relativePath)].filter(Boolean).join('/'))
    await fs?.rename?.(source, targetPath)
    return loadVaultPayload(target, vault)
  },
  deleteEntry: async({ relativePath } = {}) => {
    const vault = getActiveVault(target)
    const targetPath = resolveInsideVault(target, vault.path, relativePath)
    await getFs(target)?.remove?.(targetPath, { recursive: true })
    return loadVaultPayload(target, vault)
  },
  importGoogleKeep: async() => ({ imported: 0, skipped: 0, reason: 'not-implemented-in-tauri-bridge' }),
  calendar: {
    list: async() => readJsonFile(getFs(target), workspacePath(target, getActiveVault(target)?.path || '', CALENDAR_FILE), { events: [] }).then((data) => data.events || []),
    importGoogle: async() => ({ imported: 0 }),
    importGoogleFromPath: async() => ({ imported: 0 }),
    googleConfigGet: async() => ({}),
    googleConfigSet: async(config) => config,
    googleSync: async() => ({ synced: 0 })
  },
  sources: {
    list: async() => readJsonFile(getFs(target), workspacePath(target, getActiveVault(target)?.path || '', SOURCES_FILE), { sources: [] }).then((data) => data.sources || []),
    ingestUrl: async() => null,
    importRss: async() => ({ imported: 0 })
  },
  wiki: {
    list: async() => readJsonFile(getFs(target), workspacePath(target, getActiveVault(target)?.path || '', WIKI_FILE), { records: [] }).then((data) => data.records || []),
    propose: async() => [],
    accept: async() => null,
    dismiss: async() => null,
    sourceInfo: async() => null,
    context: async() => ({ records: [], notes: [] })
  },
  search: {
    initVault: async() => ({ ok: true, runtime: 'tauri' }),
    query: async() => ({ results: [] }),
    status: async() => ({ enabled: false, runtime: 'tauri' }),
    inspect: async() => ({}),
    rebuild: async() => ({ ok: true }),
    clear: async() => ({ ok: true }),
    disable: async() => ({ ok: true }),
    enable: async() => ({ ok: true })
  },
  models: {
    list: async() => [],
    listLocal: async() => [],
    getSelection: async() => ({}),
    setSelection: async(selection) => selection,
    active: async() => null,
    searchHuggingFace: async() => [],
    info: async() => null,
    download: async() => ({ ok: false, reason: 'desktop-only' }),
    cancelDownload: async() => ({ ok: true }),
    downloadStatus: async() => null,
    activate: async() => null,
    deactivate: async() => null,
    remove: async() => null,
    refreshIndex: async() => ({ ok: true }),
    onDownloadProgress: () => () => {}
  },
  sitePreview: {
    previewFolder: async() => ({ ok: false, reason: 'not-implemented-in-tauri-bridge' }),
    buildFolder: async() => ({ ok: false, reason: 'not-implemented-in-tauri-bridge' }),
    stop: async() => ({ ok: true }),
    status: async() => null,
    openExternal: async(url) => target.electron?.shell?.openExternal?.(url)
  },
  atomicFeatures: {
    describeApi: async() => ({ runtime: 'tauri', actions: [] }),
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
    pullModel: async() => ({ ok: false, reason: 'desktop-only' }),
    onModelPullProgress: () => () => {}
  },
  agents: { list: async() => [], register: async() => null, unregister: async() => null, send: async() => null },
  atomic: { getCatalog: async() => [] },
  plugins: { list: async() => [], set: async(payload) => payload, run: async() => null },
  tasks: { list: async() => [], set: async(payload) => payload, run: async() => null },
  rag: { chat: async() => ({ answer: '', sources: [] }) },
  notes: { autotag: async() => ({ tags: [] }) },
  mcp: { listTools: async() => [], callTool: async() => null },
  programs: { list: async() => [], set: async(payload) => payload, run: async() => null }
})

export const installTauriElephantNoteBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target?.elephantnote?.getVaults) return false
  target.__TAURI_SELECT_DIRECTORY__ = async() => {
    const dialog = await import('@tauri-apps/plugin-dialog')
    return dialog.open({ multiple: false, directory: true, createDirectory: true })
  }
  target.elephantnote = {
    ...(target.elephantnote || {}),
    ...createBridge(target)
  }
  return true
}
