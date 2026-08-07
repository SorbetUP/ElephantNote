#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const nodeModules = resolve(root, 'Elephant/node_modules')
const viteCli = resolve(nodeModules, 'vite/bin/vite.js')

const runNode = (script, args = [], env = process.env) => {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    stdio: 'inherit',
    env
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

runNode('build/scripts/build-muya-wasm.mjs')

if (!existsSync(viteCli)) {
  throw new Error(`Vite CLI is unavailable at ${viteCli}. Run pnpm install before building.`)
}

runNode('Elephant/node_modules/vite/bin/vite.js', ['build', '--config', resolve(root, 'vite.tauri.config.mjs')], {
  ...process.env,
  NODE_PATH: nodeModules
})
runNode('build/scripts/report-renderer-bundle.mjs')
