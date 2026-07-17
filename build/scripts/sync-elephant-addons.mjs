import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repository = 'https://github.com/SorbetUP/Elephant-Addons.git'
const pinnedRef = process.env.ELEPHANT_ADDONS_REF || '1da098cc4ddb39b7cb4641a7d2c05c6b533a564f'
const cacheRoot = path.join(root, '.cache', 'elephant-addons')

const runGit = (args, cwd = root) => execFileSync('git', args, { cwd, stdio: 'inherit' })
const currentHead = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cacheRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

if (currentHead() !== pinnedRef) {
  fs.rmSync(cacheRoot, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(cacheRoot), { recursive: true })
  runGit(['clone', '--filter=blob:none', '--no-checkout', repository, cacheRoot])
  runGit(['fetch', '--depth', '1', 'origin', pinnedRef], cacheRoot)
  runGit(['checkout', '--detach', 'FETCH_HEAD'], cacheRoot)
  if (currentHead() !== pinnedRef) throw new Error(`Elephant-Addons checkout mismatch: expected ${pinnedRef}`)
}

for (const required of ['catalog.json', 'official', 'packs/base.enaddonpack', 'packs/develop-parity.enaddonpack']) {
  if (!fs.existsSync(path.join(cacheRoot, required))) throw new Error(`Elephant-Addons is missing ${required}`)
}

const ensureLink = (linkName, target) => {
  const linkPath = path.join(root, linkName)
  fs.rmSync(linkPath, { recursive: true, force: true })
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

ensureLink('addons', cacheRoot)
ensureLink('packs', path.join(cacheRoot, 'packs'))
console.log(`[addons] materialized Elephant-Addons ${pinnedRef}`)
