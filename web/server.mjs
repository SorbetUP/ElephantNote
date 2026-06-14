import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebGitSyncEngine } from './sync/WebGitSyncEngine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
const vaultRoot = path.resolve(process.env.ELEPHANTNOTE_VAULT || '/data/vault')
const port = Number(process.env.PORT || 8787)

const pathExists = async(target) => fs.access(target).then(() => true, () => false)
const ensureDir = async(target) => fs.mkdir(target, { recursive: true })

const syncEngine = new WebGitSyncEngine({ cwd: vaultRoot })

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

const routeApi = async(req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/notes') return send(res, 200, await listNotes())
  if (req.method === 'POST' && url.pathname === '/api/notes') return send(res, 201, await createNote(await readBody(req)))
  if (req.method === 'GET' && url.pathname === '/api/sync/status') return send(res, 200, syncEngine.status())
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

