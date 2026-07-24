#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, rmSync, cpSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const configIndex = args.indexOf('--config')
const config = configIndex >= 0 ? args[configIndex + 1] : null
const tauriArgs = ['tauri', 'build']
if (config) {
  tauriArgs.push('--config', resolve(root, config))
}

const llamaResult = spawnSync('node', ['build/scripts/ensure-tauri-llama-server.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

if (llamaResult.status !== 0) {
  process.exit(llamaResult.status ?? 1)
}

const result = spawnSync('cargo', tauriArgs, {
  cwd: join(root, 'Elephant/backend/tauri'),
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const bundleRoot = join(root, 'Elephant/backend/tauri', 'target', 'release', 'bundle')
const distRoot = join(root, 'dist')

if (!existsSync(bundleRoot)) {
  process.exit(0)
}

rmSync(distRoot, { recursive: true, force: true })
mkdirSync(distRoot, { recursive: true })

const copyFiles = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = join(dir, entry.name)
    if (entry.isDirectory()) {
      copyFiles(source)
      continue
    }

    // Tauri's AppImage staging tree contains symlinks, including links that can
    // resolve back into the repository dist directory. Following those links
    // turns the flattening pass into a self-copy and makes a successful package
    // build fail after the AppImage has already been produced.
    const metadata = lstatSync(source)
    if (!metadata.isFile()) continue

    const destination = join(distRoot, entry.name)
    if (existsSync(destination) && realpathSync(source) === realpathSync(destination)) continue
    cpSync(source, destination, { force: true, dereference: false })
  }
}

copyFiles(bundleRoot)
