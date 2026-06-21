#!/usr/bin/env node
/**
 * Cross-platform postinstall: patch native-keymap for C++20, download Electron,
 * rebuild all native modules for Electron's ABI, generate locale files.
 *
 * native-keymap is listed as optionalDependency so pnpm ignores its auto-gyp
 * compile failure on Node v24+. This script restores the source, patches and
 * rebuilds it correctly via @electron/rebuild.
 *
 * Step order matters: native-keymap source must be restored before downloading
 * Electron, because the inner `pnpm add` can disturb devDependency state.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')

function run(cmd, env = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, env: { ...process.env, ...env } })
}

function patchElectronDevBundle() {
  if (process.platform !== 'darwin') return

  const electronAppBundle = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
  const appBundle = path.join(root, 'node_modules', 'electron', 'dist', 'Elephant.app')
  if (!fs.existsSync(appBundle) && fs.existsSync(electronAppBundle)) {
    fs.renameSync(electronAppBundle, appBundle)
  }

  const plistPath = path.join(appBundle, 'Contents', 'Info.plist')
  if (!fs.existsSync(plistPath)) return

  const plistBuddy = '/usr/libexec/PlistBuddy'
  const setPlistValue = (key, value) => {
    try {
      execSync(`"${plistBuddy}" -c "Set :${key} ${value}" "${plistPath}"`, { stdio: 'ignore' })
    } catch {
      execSync(`"${plistBuddy}" -c "Add :${key} string ${value}" "${plistPath}"`, { stdio: 'ignore' })
    }
  }

  console.log('Patching Electron dev bundle name...')
  setPlistValue('CFBundleDisplayName', 'Elephant')
  setPlistValue('CFBundleName', 'Elephant')
  setPlistValue('CFBundleExecutable', 'Elephant')
  setPlistValue('CFBundleIdentifier', 'com.elephantnote.dev')

  const electronExecutable = path.join(appBundle, 'Contents', 'MacOS', 'Electron')
  const elephantExecutable = path.join(appBundle, 'Contents', 'MacOS', 'Elephant')
  if (!fs.existsSync(elephantExecutable) && fs.existsSync(electronExecutable)) {
    fs.renameSync(electronExecutable, elephantExecutable)
  }

  fs.writeFileSync(
    path.join(root, 'node_modules', 'electron', 'path.txt'),
    'Elephant.app/Contents/MacOS/Elephant'
  )

  const sourceIcon = path.join(root, 'static', 'icon.icns')
  const targetIcon = path.join(appBundle, 'Contents', 'Resources', 'electron.icns')
  if (fs.existsSync(sourceIcon) && fs.existsSync(path.dirname(targetIcon))) {
    fs.copyFileSync(sourceIcon, targetIcon)
  }

  try {
    execSync(`codesign --force --deep --sign - "${appBundle}"`, { stdio: 'ignore' })
  } catch {
    console.warn('Unable to ad-hoc sign Electron dev bundle after renaming.')
  }
}

// Detect which package manager invoked this postinstall so commands work
// regardless of whether the caller is pnpm (primary) or npm (fallback).
const userAgent = process.env.npm_config_user_agent || ''
const isPnpm = userAgent.startsWith('pnpm')
// patch-package and electron-rebuild are locally installed; call their
// node_modules/.bin entries directly to avoid any package-manager dependency.
const ext = process.platform === 'win32' ? '.cmd' : ''
const patchPackageBin = path.join(root, 'node_modules', '.bin', `patch-package${ext}`)
const electronRebuildBin = path.join(root, 'node_modules', '.bin', `electron-rebuild${ext}`)

// ── 1. Ensure native-keymap source is present (pm removes it on optional failure) ──
const nativeKeymapDir = path.join(root, 'node_modules', 'native-keymap')
if (!fs.existsSync(nativeKeymapDir)) {
  console.log('Installing native-keymap source (skipping compilation)...')
  // native-keymap is already in optionalDependencies so neither command changes
  // the version range in package.json.
  if (isPnpm) {
    run('pnpm add native-keymap --ignore-scripts')
  } else {
    run('npm install native-keymap --ignore-scripts --no-save')
  }
}

// ── 2. Download + extract Electron binary ────────────────────────────────────
const electronInstall = path.join(root, 'node_modules', 'electron', 'install.js')

if (!fs.existsSync(electronInstall)) {
  console.error('electron/install.js not found — skipping Electron download')
} else {
  const os = require('os')
  const plat = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || os.platform()
  const platformBinary =
    plat === 'win32'
      ? 'electron.exe'
      : plat === 'darwin' || plat === 'mas'
        ? 'Electron.app/Contents/MacOS/Electron'
        : 'electron'

  const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt')
  const distDir = path.join(root, 'node_modules', 'electron', 'dist')

  // On macOS we also require Frameworks/ — yauzl v2.10.0 hangs on Node v26+ and
  // silently produces an incomplete dist/ without Frameworks.
  const isComplete = () => {
    if (!fs.existsSync(pathTxt)) return false
    const rel = fs.readFileSync(pathTxt, 'utf8').trim()
    if (!fs.existsSync(path.join(root, 'node_modules', 'electron', rel))) return false
    if (plat === 'darwin' || plat === 'mas') {
      const appRoot = rel.includes('.app/')
        ? path.join(distDir, rel.slice(0, rel.indexOf('.app/') + 4))
        : path.join(distDir, 'Electron.app')
      return fs.existsSync(path.join(appRoot, 'Contents', 'Frameworks'))
    }
    return true
  }

  if (!isComplete()) {
    // Remove any partial dist so install.js always runs extraction fresh
    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
    if (fs.existsSync(pathTxt)) fs.unlinkSync(pathTxt)

    console.log('Downloading Electron binary...')
    try {
      run(`node "${electronInstall}"`)
    } catch {
      const mirror = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
      console.log(`Direct download failed, retrying with mirror: ${mirror}`)
      run(`node "${electronInstall}"`, { ELECTRON_MIRROR: mirror })
    }

    // yauzl v2.10.0 + Node v26+: openReadStream callback never fires for
    // compressed entries → extract-zip exits silently with incomplete dist/.
    // Re-extract using system unzip which handles the zip correctly.
    if ((plat === 'darwin' || plat === 'mas') &&
        !fs.existsSync(path.join(distDir, 'Electron.app', 'Contents', 'Frameworks'))) {
      const { version } = require(path.join(root, 'node_modules', 'electron', 'package.json'))
      const arch = process.env.npm_config_arch || os.arch()
      const zipName = `electron-v${version}-darwin-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`
      const cacheRoot = process.env.electron_config_cache ||
        path.join(os.homedir(), 'Library', 'Caches', 'electron')

      let zipPath = ''
      try {
        zipPath = execSync(
          `find "${cacheRoot}" -name "${zipName}" 2>/dev/null | head -1`
        ).toString().trim()
      } catch { /* ignore */ }

      if (!zipPath) {
        throw new Error(
          'Electron zip not in cache after download. ' +
          'Try: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install'
        )
      }

      console.log(`Re-extracting with system unzip (yauzl incompatible with Node ${process.version})...`)
      if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true })
      run(`unzip -q "${zipPath}" -d "${distDir}"`)
      fs.writeFileSync(pathTxt, platformBinary)
      fs.writeFileSync(path.join(distDir, 'version'), version)
    }

    // Ensure path.txt exists (install.js may skip it on a cache hit)
    if (!fs.existsSync(pathTxt)) {
      fs.writeFileSync(pathTxt, platformBinary)
    }
  }
}

// Rename the local Electron.app used by `electron-vite dev` so macOS Dock does
// not show the upstream runtime name while developing Elephant.
patchElectronDevBundle()

// ── 3. Apply C++20 patch to native-keymap ───────────────────────────────────
console.log('Applying patches...')
run(`"${patchPackageBin}"`)

// ── 4. Rebuild native modules for Electron ABI ──────────────────────────────
console.log('Rebuilding native modules for Electron...')
run(`"${electronRebuildBin}" -f`)

// ── 5. Generate minified locale files ───────────────────────────────────────
console.log('Minifying locales...')
run('node scripts/minify-locales.mjs')
