import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import vm from 'node:vm'

const catalogueRoot = path.resolve(process.argv[2] || '')
if (!process.argv[2]) {
  console.error('Usage: node build/scripts/validate-addon-catalog.mjs <catalogue-directory>')
  process.exit(2)
}

const fail = (message) => {
  throw new Error(`[addon-catalog] ${message}`)
}

const safePath = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty path`)
  const normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..' || !part)) {
    fail(`${label} is not a safe relative path: ${value}`)
  }
  return normalized
}

const readJson = async (relativePath) => {
  const raw = await fs.readFile(path.join(catalogueRoot, relativePath), 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    fail(`${relativePath} is invalid JSON: ${error.message}`)
  }
}

const isTrustedManifest = (manifest = {}) => {
  const mode = String(manifest.runtime?.mode || manifest.contributes?.runtimeMode || manifest.contributes?.security?.access || '').toLowerCase()
  return ['trusted', 'full', 'full-app', 'full-app-access'].includes(mode)
}

const validateTrustedEntry = (entry, manifest, source) => {
  if (!/export\s+default\s+class\s+[A-Za-z_$][\w$]*/.test(source)) {
    fail(`${entry.id} trusted entry must export one default addon class`)
  }
  if (!/\bonload\s*\(/.test(source)) fail(`${entry.id} trusted entry must implement onload(api)`)
  if (/\bfrom\s+['"]|\bimport\s*\(/.test(source)) {
    fail(`${entry.id} trusted catalogue entry must be a self-contained package entry`)
  }
  if (manifest.permissions?.native === true && !manifest.native?.protocol) {
    fail(`${entry.id} requests native access without declaring a native protocol`)
  }
  console.log(`[addon-catalog] ok id=${entry.id} version=${entry.version} runtime=trusted official=${entry.official === true}`)
}

const validateIsolatedEntry = async (entry, manifest, source) => {
  const sandbox = { self: {}, Intl, Date, Math }
  vm.runInNewContext(source, sandbox, { filename: entry.entryPath, timeout: 1_000 })
  const definition = sandbox.self.elephantAddon
  if (!definition || typeof definition.activate !== 'function') {
    fail(`${entry.id} must assign self.elephantAddon.activate`)
  }

  const registeredCommands = []
  const registeredViews = []
  const unavailable = (name) => async () => fail(`${entry.id} called ${name} during activation`)
  const api = Object.freeze({
    app: Object.freeze({ info: unavailable('app.info') }),
    notes: Object.freeze({
      list: unavailable('notes.list'),
      read: unavailable('notes.read'),
      write: unavailable('notes.write')
    }),
    http: Object.freeze({ request: unavailable('http.request') }),
    storage: Object.freeze({
      get: async () => null,
      set: unavailable('storage.set'),
      remove: unavailable('storage.remove'),
      entries: unavailable('storage.entries')
    }),
    commands: Object.freeze({
      register(command) {
        if (!command?.id?.startsWith(`${entry.id}.`)) fail(`${entry.id} registered invalid command id ${command?.id}`)
        if (typeof command.run !== 'function') fail(`${command.id} has no run handler`)
        registeredCommands.push(command)
        return () => {}
      }
    }),
    views: Object.freeze({
      register(view) {
        if (!view?.id?.startsWith(`${entry.id}.`)) fail(`${entry.id} registered invalid view id ${view?.id}`)
        if (typeof view.kind !== 'string' || !view.kind) fail(`${view.id} has no declarative kind`)
        if (typeof view.getState !== 'function') fail(`${view.id} has no getState handler`)
        if (typeof view.dispatch !== 'function') fail(`${view.id} has no dispatch handler`)
        registeredViews.push(view)
        return () => {}
      }
    })
  })
  await definition.activate(api)

  const declaredCommands = Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands : []
  const registeredCommandIds = registeredCommands.map((command) => command.id).sort()
  const declaredCommandIds = declaredCommands.map((command) => command.id).sort()
  if (JSON.stringify(registeredCommandIds) !== JSON.stringify(declaredCommandIds)) {
    fail(`${entry.id} registered commands do not match manifest contributions`)
  }

  const declaredViews = Array.isArray(manifest.contributes?.views) ? manifest.contributes.views : []
  const registeredViewSignatures = registeredViews.map((view) => `${view.id}:${view.kind}`).sort()
  const declaredViewSignatures = declaredViews.map((view) => `${view.id}:${view.kind}`).sort()
  if (JSON.stringify(registeredViewSignatures) !== JSON.stringify(declaredViewSignatures)) {
    fail(`${entry.id} registered views do not match manifest contributions`)
  }

  console.log(`[addon-catalog] ok id=${entry.id} version=${entry.version} runtime=isolated commands=${registeredCommands.length} views=${registeredViews.length}`)
  return { commands: registeredCommands.length, views: registeredViews.length }
}

const catalog = await readJson('catalog.json')
if (catalog.version !== 1) fail(`unsupported catalogue version ${catalog.version}`)
if (!['addon-catalog', 'integrated'].includes(catalog.branch)) fail('branch marker must be addon-catalog or integrated')
if (!Array.isArray(catalog.addons) || catalog.addons.length === 0) fail('catalogue must contain at least one addon')
const packageRoot = safePath(catalog.packageRoot || 'addons', 'packageRoot')

const ids = new Set()
const slugs = new Set()
let commandCount = 0
let viewCount = 0
let trustedCount = 0
let officialCount = 0

for (const entry of catalog.addons) {
  for (const field of ['id', 'slug', 'name', 'version', 'manifestPath', 'entryPath']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`${entry.id || entry.slug || 'entry'} is missing ${field}`)
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) fail(`invalid slug ${entry.slug}`)
  if (ids.has(entry.id)) fail(`duplicate addon id ${entry.id}`)
  if (slugs.has(entry.slug)) fail(`duplicate addon slug ${entry.slug}`)
  ids.add(entry.id)
  slugs.add(entry.slug)

  const firstPartyId = entry.id.startsWith('elephant.')
  if (firstPartyId && entry.official !== true) fail(`${entry.id} must be explicitly marked official`)
  if (!firstPartyId && entry.official === true) fail(`${entry.id} cannot use the official first-party marker`)
  if (entry.official === true) officialCount += 1

  const prefix = `${packageRoot}/${entry.slug}/`
  const manifestPath = safePath(entry.manifestPath, `${entry.id}.manifestPath`)
  const entryPath = safePath(entry.entryPath, `${entry.id}.entryPath`)
  entry.entryPath = entryPath
  if (!manifestPath.startsWith(prefix) || !entryPath.startsWith(prefix)) {
    fail(`${entry.id} files must stay under ${prefix}`)
  }

  const manifest = await readJson(manifestPath)
  if (manifest.id !== entry.id || manifest.name !== entry.name || manifest.version !== entry.version) {
    fail(`${entry.id} catalogue metadata does not match its manifest`)
  }
  if (manifest.apiVersion !== 1) fail(`${entry.id} must use apiVersion 1`)
  if (manifest.runtime?.type !== 'javascript-worker') fail(`${entry.id} must use javascript-worker`)
  if (manifest.runtime?.entry !== path.posix.basename(entryPath)) {
    fail(`${entry.id} runtime.entry must match entryPath`)
  }

  const source = await fs.readFile(path.join(catalogueRoot, entryPath), 'utf8')
  if (isTrustedManifest(manifest)) {
    validateTrustedEntry(entry, manifest, source)
    trustedCount += 1
  } else {
    const counts = await validateIsolatedEntry(entry, manifest, source)
    commandCount += counts.commands
    viewCount += counts.views
  }
}

console.log(`[addon-catalog] valid addons=${catalog.addons.length} official=${officialCount} trusted=${trustedCount} commands=${commandCount} views=${viewCount}`)
