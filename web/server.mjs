import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebGitSyncEngine } from './sync/WebGitSyncEngine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const vaultRoot = path.resolve(process.env.ELEPHANTNOTE_VAULT || '/data/vault')
const port = Number(process.env.PORT || 8787)
const autoSyncRemote = String(process.env.ELEPHANTNOTE_SYNC_REMOTE || '')
const autoSyncRemoteName = String(process.env.ELEPHANTNOTE_SYNC_REMOTE_NAME || 'origin')
const autoSyncBranch = String(process.env.ELEPHANTNOTE_SYNC_BRANCH || '')
const autoSyncMode = String(process.env.ELEPHANTNOTE_SYNC_AUTO_MODE || 'pull')
const autoSyncIntervalMs = Number(process.env.ELEPHANTNOTE_SYNC_AUTO_INTERVAL_MS || 0)

const pathExists = async(target) => fs.access(target).then(() => true, () => false)
const ensureDir = async(target) => fs.mkdir(target, { recursive: true })

const syncEngine = new WebGitSyncEngine({ cwd: vaultRoot })
const autoSyncState = {
  enabled: Boolean(autoSyncRemote && autoSyncIntervalMs > 0),
  mode: autoSyncMode,
  intervalMs: autoSyncIntervalMs,
  running: false,
  skippedBusy: 0,
  attempts: 0,
  successes: 0,
  failures: 0,
  lastAttemptAt: '',
  lastSuccessAt: '',
  lastError: ''
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

const readBody = async(req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

const safePath = (relativePath = '') => {
  const target = path.resolve(vaultRoot, String(relativePath || ''))
  if (target !== vaultRoot && !target.startsWith(`${vaultRoot}${path.sep}`)) {
    const error = new Error('Path escapes the configured vault.')
    error.status = 400
    throw error
  }
  return target
}

const listNotes = async() => {
  await ensureDir(vaultRoot)
  const notes = []
  const walk = async(directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.elephantnote') continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.md')) {
        const stat = await fs.stat(fullPath)
        notes.push({
          path: path.relative(vaultRoot, fullPath),
          title: entry.name.replace(/\.md$/i, ''),
          updatedAt: stat.mtime.toISOString()
        })
      }
    }
  }
  await walk(vaultRoot)
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const createNote = async({ title = 'Untitled', body = '' } = {}) => {
  await ensureDir(vaultRoot)
  const base = String(title || 'Untitled').replace(/[\\/:*?"<>|#]+/g, ' ').trim() || 'Untitled'
  const filename = `${base.slice(0, 80)}.md`
  const target = safePath(filename)
  await fs.writeFile(target, `# ${base}\n\n${String(body || '')}\n`, 'utf8')
  return { path: path.relative(vaultRoot, target), title: base }
}

const createAutoSyncPayload = () => {
  const init = {
    remote: autoSyncRemote,
    remoteName: autoSyncRemoteName,
    branch: autoSyncBranch
  }
  const pull = {
    remoteName: autoSyncRemoteName,
    branch: autoSyncBranch
  }
  if (autoSyncMode === 'send-receive') {
    return {
      init,
      snapshot: { message: `ElephantNote auto sync ${new Date().toISOString()}` },
      pull,
      push: pull
    }
  }
  return { init, pull }
}

const runAutoSyncOnce = async(reason = 'interval') => {
  if (!autoSyncState.enabled || autoSyncState.running) return autoSyncState
  if (syncEngine.status().running) {
    autoSyncState.skippedBusy += 1
    return autoSyncState
  }
  autoSyncState.running = true
  autoSyncState.attempts += 1
  autoSyncState.lastAttemptAt = new Date().toISOString()
  try {
    await syncEngine.run(createAutoSyncPayload())
    autoSyncState.successes += 1
    autoSyncState.lastSuccessAt = new Date().toISOString()
    autoSyncState.lastError = ''
  } catch (error) {
    autoSyncState.failures += 1
    autoSyncState.lastError = error.message || 'Auto sync failed.'
    console.warn('[elephantnote:auto-sync] failed', { reason, error: autoSyncState.lastError })
  } finally {
    autoSyncState.running = false
  }
  return autoSyncState
}

const routeApi = async(req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/notes') return send(res, 200, await listNotes())
  if (req.method === 'POST' && url.pathname === '/api/notes') return send(res, 201, await createNote(await readBody(req)))
  if (req.method === 'GET' && url.pathname === '/api/sync/status') return send(res, 200, syncEngine.status())
  if (req.method === 'GET' && url.pathname === '/api/sync/auto/status') return send(res, 200, autoSyncState)
  if (req.method === 'POST' && url.pathname === '/api/sync/auto/run') return send(res, 200, await runAutoSyncOnce('api'))
  if (req.method === 'POST' && url.pathname === '/api/sync/run') return send(res, 200, await syncEngine.run(await readBody(req)))
  return false
}

const routeStatic = async(_req, res, url) => {
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const target = path.resolve(publicDir, requested)
  if (!target.startsWith(publicDir) || !await pathExists(target)) return send(res, 404, { error: 'Not found' })
  const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'
  send(res, 200, await fs.readFile(target, 'utf8'), type)
}

await ensureDir(vaultRoot)
http.createServer(async(req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (await routeApi(req, res, url) !== false) return
    await routeStatic(req, res, url)
  } catch (error) {
    send(res, error.status || 500, { error: error.message || 'Server error' })
  }
}).listen(port, () => {
  console.log(`ElephantNote web listening on http://0.0.0.0:${port}`)
})

if (autoSyncState.enabled) {
  console.log('[elephantnote:auto-sync] enabled', {
    mode: autoSyncMode,
    intervalMs: autoSyncIntervalMs,
    remote: autoSyncRemote,
    branch: autoSyncBranch
  })
  setTimeout(() => runAutoSyncOnce('startup'), 250).unref?.()
  setInterval(() => runAutoSyncOnce('interval'), autoSyncIntervalMs).unref?.()
}
