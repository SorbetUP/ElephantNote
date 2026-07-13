import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(__filename), '../..')

const fail = (message) => {
  console.error(`[physical-addon] ${message}`)
  process.exit(1)
}

const run = (command, args, options = {}) => {
  console.log(`[physical-addon] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) }
  })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) fail(`${command} exited with ${result.status}`)
  return options.capture ? String(result.stdout || '').trim() : ''
}

const PROCESS_SIDECAR_PLATFORMS = new Set([
  'macos-aarch64',
  'macos-x86_64',
  'linux-aarch64',
  'linux-x86_64',
  'windows-aarch64',
  'windows-x86_64'
])

const platformKey = () => {
  const os = process.platform === 'darwin'
    ? 'macos'
    : process.platform === 'win32'
      ? 'windows'
      : process.platform
  const arch = process.arch === 'arm64'
    ? 'aarch64'
    : process.arch === 'x64'
      ? 'x86_64'
      : process.arch
  return `${os}-${arch}`
}

const addonArg = process.argv[2]
if (!addonArg) fail('usage: node build/scripts/build-physical-addon.mjs <addon-directory>')

const addonDir = resolve(repoRoot, addonArg)
const manifestPath = join(addonDir, 'manifest.json')
const buildConfigPath = join(addonDir, 'addon.build.json')
if (!existsSync(manifestPath)) fail(`missing ${manifestPath}`)
if (!existsSync(buildConfigPath)) fail(`missing ${buildConfigPath}`)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const buildConfig = JSON.parse(readFileSync(buildConfigPath, 'utf8'))
const platform = String(process.env.ELEPHANT_ADDON_PLATFORM || platformKey()).trim()
if (buildConfig.runner !== 'process') fail('addon.build.json runner must be process')
if (!PROCESS_SIDECAR_PLATFORMS.has(platform)) {
  fail(`process sidecars cannot be packaged for ${platform}; Android and iOS require package-owned mobile host adapters`)
}
if (!Array.isArray(buildConfig.supportedPlatforms) || !buildConfig.supportedPlatforms.includes(platform)) {
  fail(`addon.build.json does not support platform ${platform}`)
}
const sidecarRelativePath = manifest?.native?.sidecars?.[platform]
if (!sidecarRelativePath) fail(`manifest has no native sidecar path for ${platform}`)

const nativeManifest = resolve(addonDir, buildConfig.nativeManifest)
const binaryName = String(buildConfig.binaryName || '').trim()
if (!binaryName) fail('addon.build.json requires binaryName')
if (!existsSync(nativeManifest)) fail(`missing native manifest ${nativeManifest}`)

const safeId = String(manifest.id || basename(addonDir)).replace(/[^a-z0-9._-]/gi, '-')
const targetDir = resolve(repoRoot, 'build/out/addon-target', safeId)
const stagingDir = resolve(repoRoot, 'build/out/addons/staging', safeId)
const releaseDir = resolve(repoRoot, 'build/out/addons/releases', safeId)
const targetTriple = String(process.env.CARGO_BUILD_TARGET || '').trim()
const cargoCommand = String(process.env.CARGO_COMMAND || 'cargo').trim()

rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })
mkdirSync(releaseDir, { recursive: true })

const cargoArgs = ['build', '--release', '--manifest-path', nativeManifest]
if (targetTriple) cargoArgs.push('--target', targetTriple)
run(cargoCommand, cargoArgs, { env: { CARGO_TARGET_DIR: targetDir } })

const binaryFileName = platform.startsWith('windows-') ? `${binaryName}.exe` : binaryName
const binaryPath = targetTriple
  ? join(targetDir, targetTriple, 'release', binaryFileName)
  : join(targetDir, 'release', binaryFileName)
if (!existsSync(binaryPath)) fail(`built sidecar not found at ${binaryPath}`)

cpSync(manifestPath, join(stagingDir, 'manifest.json'))
cpSync(join(addonDir, manifest.runtime.entry), join(stagingDir, manifest.runtime.entry))
if (existsSync(join(addonDir, 'assets'))) {
  cpSync(join(addonDir, 'assets'), join(stagingDir, 'assets'), { recursive: true })
}

const stagedSidecar = join(stagingDir, sidecarRelativePath)
mkdirSync(dirname(stagedSidecar), { recursive: true })
cpSync(binaryPath, stagedSidecar)

const outputName = `${safeId}-${manifest.version}-${platform}.enaddon`
const outputPath = join(releaseDir, outputName)
const packagerOutput = run('cargo', [
  'run',
  '--quiet',
  '--manifest-path',
  resolve(repoRoot, 'build/tools/enaddon-packager/Cargo.toml'),
  '--',
  stagingDir,
  outputPath
], { capture: true })

const metadata = JSON.parse(packagerOutput.split(/\r?\n/).filter(Boolean).at(-1))
const metadataPath = `${outputPath}.json`
writeFileSync(metadataPath, `${JSON.stringify({
  ...metadata,
  id: manifest.id,
  version: manifest.version,
  platform,
  file: outputName,
  catalogPath: `addons/${basename(addonDir)}/releases/${outputName}`
}, null, 2)}\n`)

console.log(`[physical-addon] package=${outputPath}`)
console.log(`[physical-addon] blake3=${metadata.blake3}`)
console.log(`[physical-addon] metadata=${metadataPath}`)
