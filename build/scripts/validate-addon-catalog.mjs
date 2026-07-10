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

const catalog = await readJson('catalog.json')
if (catalog.version !== 1) fail(`unsupported catalogue version ${catalog.version}`)
if (catalog.branch !== 'addon-catalog') fail('branch marker must be addon-catalog')
if (!Array.isArray(catalog.addons) || catalog.addons.length === 0) fail('catalogue must contain at least one addon')

const ids = new Set()
const slugs = new Set()
let commandCount = 0

for (const entry of catalog.addons) {
  for (const field of ['id', 'slug', 'name', 'version', 'manifestPath', 'entryPath']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`${entry.id || entry.slug || 'entry'} is missing ${field}`)
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) fail(`invalid slug ${entry.slug}`)
  if (ids.has(entry.id)) fail(`duplicate addon id ${entry.id}`)
  if (slugs.has(entry.slug)) fail(`duplicate addon slug ${entry.slug}`)
  ids.add(entry.id)
  slugs.add(entry.slug)

  const prefix = `addons/${entry.slug}/`
  const manifestPath = safePath(entry.manifestPath, `${entry.id}.manifestPath`)
  const entryPath = safePath(entry.entryPath, `${entry.id}.entryPath`)
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
  const sandbox = { self: {} }
  vm.runInNewContext(source, sandbox, { filename: entryPath, timeout: 1_000 })
  const definition = sandbox.self.elephantAddon
  if (!definition || typeof definition.activate !== 'function') {
    fail(`${entry.id} must assign self.elephantAddon.activate`)
  }

  const registered = []
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
      get: unavailable('storage.get'),
      set: unavailable('storage.set'),
      remove: unavailable('storage.remove'),
      entries: unavailable('storage.entries')
    }),
    commands: Object.freeze({
      register(command) {
        if (!command?.id?.startsWith(`${entry.id}.`)) fail(`${entry.id} registered invalid command id ${command?.id}`)
        if (typeof command.run !== 'function') fail(`${command.id} has no run handler`)
        registered.push(command)
        return () => {}
      }
    })
  })
  await definition.activate(api)

  const declaredCommands = Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands : []
  const registeredIds = registered.map((command) => command.id).sort()
  const declaredIds = declaredCommands.map((command) => command.id).sort()
  if (JSON.stringify(registeredIds) !== JSON.stringify(declaredIds)) {
    fail(`${entry.id} registered commands do not match manifest contributions`)
  }
  commandCount += registered.length
  console.log(`[addon-catalog] ok id=${entry.id} version=${entry.version} commands=${registered.length}`)
}

console.log(`[addon-catalog] valid addons=${catalog.addons.length} commands=${commandCount}`)
