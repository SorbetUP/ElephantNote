#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const readText = (path) => readFileSync(resolve(root, path), 'utf8')
const readJson = (path) => JSON.parse(readText(path))

const forbiddenRuntimeInstallers = [
  'ensure-tauri-llama-server',
  'ensure-tauri-codex-runtime'
]

export const inspectBuildLauncher = (source, filename = '<memory>') => {
  const text = String(source || '')
  const errors = []

  for (const installer of forbiddenRuntimeInstallers) {
    if (text.includes(installer)) {
      errors.push(`${filename}: production packaging must not invoke optional runtime installer ${installer}`)
    }
  }

  if (/\bfetch\s*\(/.test(text)) {
    errors.push(`${filename}: production packaging launcher must not download mutable network content`)
  }

  if (!text.includes("const tauriArgs = ['tauri', 'build']")) {
    errors.push(`${filename}: launcher must construct the explicit Tauri production build command`)
  }

  if (!text.includes("spawnSync('cargo', tauriArgs")) {
    errors.push(`${filename}: launcher must invoke Cargo/Tauri directly after local validation`)
  }

  return errors
}

const assertSensitivity = () => {
  const valid = `
const tauriArgs = ['tauri', 'build']
const result = spawnSync('cargo', tauriArgs, {})
`
  const invalid = `
const tauriArgs = ['tauri', 'build']
spawnSync('node', ['build/scripts/ensure-tauri-llama-server.mjs'])
await fetch('https://api.github.com/repos/example/releases/latest')
spawnSync('cargo', tauriArgs, {})
`

  if (inspectBuildLauncher(valid, 'valid.mjs').length !== 0) {
    throw new Error('Tauri runtime boundary guard self-test rejected a local deterministic launcher')
  }

  const invalidErrors = inspectBuildLauncher(invalid, 'invalid.mjs')
  if (invalidErrors.length !== 2) {
    throw new Error(`Tauri runtime boundary guard self-test expected 2 failures, got ${invalidErrors.length}`)
  }
}

assertSensitivity()

const launcherPath = 'build/scripts/run-tauri-build.mjs'
const launcherErrors = inspectBuildLauncher(readText(launcherPath), launcherPath)
const baseConfig = readJson('Elephant/backend/tauri/tauri.conf.json')
const resources = baseConfig.bundle?.resources
const errors = [...launcherErrors]

if (!Array.isArray(resources) || resources.length !== 1 || resources[0] !== 'resources/official-addons') {
  errors.push('Elephant/backend/tauri/tauri.conf.json: desktop bundle must contain only controlled official addon resources')
}

const serializedConfig = JSON.stringify(baseConfig)
if (/llama-server|codex(?:-app-server)?/i.test(serializedConfig)) {
  errors.push('Elephant/backend/tauri/tauri.conf.json: optional AI runtimes must not be embedded by the core bundle')
}

if (errors.length > 0) {
  console.error('[tauri-runtime-boundary] production packaging boundary failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[tauri-runtime-boundary] production packaging is local, deterministic and addon-owned')
