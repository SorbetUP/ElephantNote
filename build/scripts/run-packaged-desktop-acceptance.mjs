#!/usr/bin/env node

import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const targetTriple = process.env.TAURI_BUILD_TARGET || process.env.TAURI_MACOS_TARGET
const releaseRoots = [
  targetTriple ? resolve(root, 'Elephant/backend/tauri/target', targetTriple, 'release') : null,
  resolve(root, 'Elephant/backend/tauri/target/release')
].filter(Boolean)
const releaseRoot = releaseRoots.find(existsSync) || releaseRoots[0]
const bundleRoot = resolve(releaseRoot, 'bundle')

const findFirst = (directory, predicate) => {
  if (!existsSync(directory)) return null
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findFirst(absolute, predicate)
      if (nested) return nested
      continue
    }
    if (entry.isFile() && predicate(absolute, entry.name)) return absolute
  }
  return null
}

let cleanupRoot = null
let executable = null
let packagedFormat = null
const packageEnv = {}

if (process.platform === 'linux') {
  executable = findFirst(resolve(bundleRoot, 'appimage'), (_path, name) => name.endsWith('.AppImage'))
  if (executable) chmodSync(executable, 0o755)
  packagedFormat = 'linux-appimage'
  packageEnv.APPIMAGE_EXTRACT_AND_RUN = '1'
} else if (process.platform === 'darwin') {
  executable = resolve(bundleRoot, 'macos/Elephant.app/Contents/MacOS/Elephant')
  packagedFormat = 'macos-app'
} else if (process.platform === 'win32') {
  cleanupRoot = mkdtempSync(join(tmpdir(), 'elephant-packaged-windows-'))
  const msi = findFirst(resolve(bundleRoot, 'msi'), (_path, name) => name.toLowerCase().endsWith('.msi'))
  const nsis = findFirst(resolve(bundleRoot, 'nsis'), (_path, name) => name.toLowerCase().endsWith('.exe'))

  if (msi) {
    console.log(`[packaged-acceptance] extracting MSI ${msi}`)
    const install = spawnSync('msiexec.exe', ['/a', msi, '/qn', `TARGETDIR=${cleanupRoot}`], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true
    })
    if (install.error || ![0, 3010].includes(install.status ?? 1)) {
      console.error(`[packaged-acceptance] MSI extraction failed: ${install.error?.message || install.status}`)
      rmSync(cleanupRoot, { recursive: true, force: true })
      process.exit(1)
    }
    packagedFormat = 'windows-msi'
  } else if (nsis) {
    console.log(`[packaged-acceptance] installing NSIS package ${nsis}`)
    const install = spawnSync(nsis, ['/S', `/D=${cleanupRoot}`], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true
    })
    if (install.error || install.status !== 0) {
      console.error(`[packaged-acceptance] NSIS install failed: ${install.error?.message || install.status}`)
      rmSync(cleanupRoot, { recursive: true, force: true })
      process.exit(1)
    }
    packagedFormat = 'windows-nsis'
  }

  executable = findFirst(cleanupRoot, (_path, name) => name.toLowerCase() === 'elephant.exe')
}

if (!executable || !existsSync(executable) || !statSync(executable).isFile()) {
  console.error(`[packaged-acceptance] no distributed package executable found under ${bundleRoot}`)
  console.error('[packaged-acceptance] run pnpm build:mac, pnpm build:linux or pnpm build:win first')
  if (cleanupRoot) rmSync(cleanupRoot, { recursive: true, force: true })
  process.exit(1)
}

console.log(`[packaged-acceptance] testing ${packagedFormat}: ${executable}`)
let status = 1
try {
  const result = spawnSync('pnpm', ['test:desktop:acceptance'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...packageEnv,
      ELEPHANT_ACCEPTANCE_SKIP_BUILD: '1',
      ELEPHANT_ACCEPTANCE_APP_PATH: executable,
      ELEPHANT_PACKAGED_FORMAT: packagedFormat
    },
    shell: process.platform === 'win32'
  })

  if (result.error) {
    console.error(`[packaged-acceptance] failed to launch runner: ${result.error.message}`)
    status = 1
  } else {
    status = result.status ?? 1
  }
} finally {
  if (cleanupRoot) rmSync(cleanupRoot, { recursive: true, force: true })
}

process.exit(status)
