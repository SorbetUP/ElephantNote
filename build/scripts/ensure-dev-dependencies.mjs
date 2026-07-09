import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dependencyFiles = ['package.json', 'pnpm-lock.yaml', '.npmrc']
const defaultRequiredModules = ['qrcode', '@zxing/browser']

export const dependencyFingerprint = (root = scriptRoot) => {
  const hash = createHash('sha256')
  for (const relativePath of dependencyFiles) {
    const path = join(root, relativePath)
    hash.update(relativePath)
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export const dependencyMarkerPath = (root = scriptRoot) =>
  join(root, 'Elephant/node_modules/.elephantnote-dev-dependencies.sha256')

export const missingRuntimeModules = (
  root = scriptRoot,
  requiredModules = defaultRequiredModules
) => {
  const resolver = createRequire(join(root, 'Elephant/frontend/app/services/__dependency_check__.cjs'))
  return requiredModules.filter((moduleName) => {
    try {
      resolver.resolve(moduleName)
      return false
    } catch {
      return true
    }
  })
}

export const inspectDependencyState = (
  root = scriptRoot,
  requiredModules = defaultRequiredModules
) => {
  const fingerprint = dependencyFingerprint(root)
  const markerPath = dependencyMarkerPath(root)
  const marker = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : ''
  const missingModules = missingRuntimeModules(root, requiredModules)
  const viteBinary = join(root, 'Elephant/node_modules/.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')

  return {
    fingerprint,
    markerPath,
    missingModules,
    markerMatches: marker === fingerprint,
    viteInstalled: existsSync(viteBinary),
    needsInstall: marker !== fingerprint || missingModules.length > 0 || !existsSync(viteBinary)
  }
}

export const markDependenciesCurrent = (root = scriptRoot, fingerprint = dependencyFingerprint(root)) => {
  const markerPath = dependencyMarkerPath(root)
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, `${fingerprint}\n`, 'utf8')
}

const installDependencies = (root) => {
  console.log('[dev-deps] package metadata changed or installed dependencies are incomplete')
  console.log('[dev-deps] running pnpm install --frozen-lockfile --prefer-offline')
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['install', '--frozen-lockfile', '--prefer-offline'],
    { cwd: root, stdio: 'inherit', env: process.env }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`pnpm install failed with exit code ${result.status ?? 'unknown'}`)
  }
}

export const ensureDevDependencies = (root = scriptRoot) => {
  const before = inspectDependencyState(root)
  if (!before.needsInstall) {
    console.log('[dev-deps] dependencies are current')
    return before
  }

  if (before.missingModules.length > 0) {
    console.log(`[dev-deps] missing runtime modules: ${before.missingModules.join(', ')}`)
  }
  installDependencies(root)

  const after = inspectDependencyState(root)
  if (after.missingModules.length > 0 || !after.viteInstalled) {
    const missing = after.missingModules.length > 0
      ? after.missingModules.join(', ')
      : 'Vite executable'
    throw new Error(`dependency installation completed but required modules are still missing: ${missing}`)
  }
  markDependenciesCurrent(root, after.fingerprint)
  console.log('[dev-deps] dependencies installed and verified')
  return { ...after, markerMatches: true, needsInstall: false }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    ensureDevDependencies(scriptRoot)
  } catch (error) {
    console.error(`[dev-deps] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
