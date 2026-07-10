import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const binDir = join(root, 'Elephant/backend/tauri', 'bin')
const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex'
const targetPath = join(binDir, binaryName)
const manifestPath = join(binDir, 'codex-runtime.json')
const repository = 'openai/codex'
const releaseTag = process.env.ELEPHANTNOTE_CODEX_RELEASE || 'rust-v0.144.1'
const maxAssetBytes = 256 * 1024 * 1024

const log = (...args) => console.log('[tauri-codex]', ...args)

if (process.env.ELEPHANTNOTE_SKIP_CODEX_BUNDLE === '1') {
  log('skip requested through ELEPHANTNOTE_SKIP_CODEX_BUNDLE=1')
  process.exit(0)
}

const run = (path, args) => spawnSync(path, args, { encoding: 'utf8', windowsHide: true })

const runtimeIsUsable = (path) => {
  if (!existsSync(path)) return false
  const version = run(path, ['--version'])
  if (version.status !== 0) return false
  const help = run(path, ['app-server', '--help'])
  const output = `${help.stdout || ''}\n${help.stderr || ''}`.toLowerCase()
  return help.status === 0 && output.includes('app-server') && (output.includes('--listen') || output.includes('stdio'))
}

const readManifest = () => {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

const existing = readManifest()
if (runtimeIsUsable(targetPath) && existing?.release === releaseTag && existing?.platform === process.platform && existing?.arch === process.arch) {
  log(`already bundled: ${targetPath} (${releaseTag})`)
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })

const requestJson = async(url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ElephantNote Codex runtime bundler',
      'x-github-api-version': '2022-11-28'
    }
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

const download = async(url, destination) => {
  const response = await fetch(url, { headers: { 'user-agent': 'ElephantNote Codex runtime bundler' } })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  if (!response.body) throw new Error('download response body is empty')
  await new Promise((resolvePromise, reject) => {
    const file = createWriteStream(destination)
    file.on('error', reject)
    response.body.pipeTo(new WritableStream({
      write(chunk) { file.write(Buffer.from(chunk)) },
      close() { file.end(resolvePromise) },
      abort(error) { file.destroy(); reject(error) }
    })).catch(reject)
  })
}

const platformTokens = {
  darwin: ['apple-darwin', 'darwin'],
  linux: ['unknown-linux-musl', 'linux'],
  win32: ['pc-windows-msvc', 'windows']
}[process.platform] || []

const archTokens = {
  arm64: ['aarch64', 'arm64'],
  x64: ['x86_64', 'x64']
}[process.arch] || []

const scoreAsset = (asset) => {
  const name = String(asset.name || '').toLowerCase()
  if (!name.startsWith('codex-')) return -1000
  if (!name.endsWith('.tar.gz') && !name.endsWith('.zip')) return -1000
  if (name.includes('desktop') || name.includes('source') || name.includes('sandbox')) return -1000
  let score = 0
  if (platformTokens.some((token) => name.includes(token))) score += 100
  if (archTokens.some((token) => name.includes(token))) score += 80
  if (process.platform === 'linux' && name.includes('musl')) score += 20
  if (name.endsWith('.zip')) score += 3
  return score
}

const extractArchive = (archive, destination) => {
  mkdirSync(destination, { recursive: true })
  if (archive.toLowerCase().endsWith('.zip')) {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force ${JSON.stringify(archive)} ${JSON.stringify(destination)}`], { stdio: 'inherit' })
      if (result.status !== 0) throw new Error('PowerShell Expand-Archive failed')
      return
    }
    const result = spawnSync('unzip', ['-q', archive, '-d', destination], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('unzip failed')
    return
  }
  const result = spawnSync('tar', ['-xzf', archive, '-C', destination], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('tar extraction failed')
}

const binaryScore = (path) => {
  const name = basename(path).toLowerCase().replace(/\.exe$/, '')
  if (name === 'codex') return 100
  if (name.startsWith('codex-') && !name.includes('sandbox') && !name.includes('proxy')) return 50
  return 0
}

const findBinary = (dir) => {
  let best = null
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      const nested = findBinary(path)
      if (nested && (!best || nested.score > best.score)) best = nested
      continue
    }
    const score = binaryScore(path)
    if (score > 0 && (!best || score > best.score)) best = { path, score }
  }
  return best
}

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const main = async() => {
  if (!platformTokens.length || !archTokens.length) {
    throw new Error(`Unsupported Codex bundle target ${process.platform}/${process.arch}`)
  }
  const release = await requestJson(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`)
  const ranked = [...(release.assets || [])]
    .map((asset) => ({ asset, score: scoreAsset(asset) }))
    .filter((entry) => entry.score > 0 && entry.asset.size > 0 && entry.asset.size <= maxAssetBytes)
    .sort((a, b) => b.score - a.score)
  const selected = ranked[0]?.asset
  if (!selected) throw new Error(`No Codex release asset matches ${process.platform}/${process.arch} in ${releaseTag}`)

  const expectedDigest = String(selected.digest || '').replace(/^sha256:/, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error(`Release asset ${selected.name} has no valid SHA-256 digest`)

  const workDir = join(tmpdir(), `elephantnote-codex-${process.pid}-${Date.now()}`)
  const archive = join(workDir, selected.name)
  const extractDir = join(workDir, 'extract')
  mkdirSync(workDir, { recursive: true })
  try {
    log(`downloading ${releaseTag}/${selected.name} (${selected.size} bytes)`)
    await download(selected.browser_download_url, archive)
    const actualDigest = sha256File(archive)
    if (actualDigest !== expectedDigest) throw new Error(`SHA-256 mismatch for ${selected.name}`)
    extractArchive(archive, extractDir)
    const extracted = findBinary(extractDir)
    if (!extracted) throw new Error('Codex executable was not found in the release archive')
    copyFileSync(extracted.path, targetPath)
    if (process.platform !== 'win32') chmodSync(targetPath, 0o755)
    if (!runtimeIsUsable(targetPath)) throw new Error('Bundled Codex executable does not expose a working app-server')
    const versionResult = run(targetPath, ['--version'])
    const version = String(versionResult.stdout || versionResult.stderr || '').trim()
    writeFileSync(manifestPath, `${JSON.stringify({
      repository,
      release: releaseTag,
      asset: selected.name,
      sha256: actualDigest,
      version,
      platform: process.platform,
      arch: process.arch
    }, null, 2)}\n`)
    log(`bundled ${version} at ${targetPath}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[tauri-codex]', error?.stack || error?.message || String(error))
  process.exit(1)
})
