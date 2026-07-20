#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const failures = []

const runtimePath = 'Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue'
const addonPath = 'addons/official/code-execution/main.js'
const trustedRuntimePath = 'Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js'
const resourcePath = 'Elephant/frontend/src/renderer/src/muya/editorRuntimeResource.js'

for (const path of [runtimePath, addonPath, trustedRuntimePath, resourcePath]) {
  if (!existsSync(resolve(root, path))) failures.push(`${path}: missing`)
}

if (failures.length === 0) {
  const runtime = read(runtimePath)
  const addon = read(addonPath)
  const trusted = read(trustedRuntimePath)
  const resource = read(resourcePath)

  const required = [
    [runtimePath, runtime, 'RustMuyaRuntimeEditor'],
    [runtimePath, runtime, "host.provide('editor.runtime'"],
    [runtimePath, runtime, "engine: 'rust'"],
    [addonPath, addon, "queryBlocks?.({ kind: 'code_block' })"],
    [addonPath, addon, "runtime?.engine === 'rust'"],
    [trustedRuntimePath, trusted, "host?.get('editor.runtime')"],
    [resourcePath, resource, "owner: 'elephant.core.editor'"],
    [resourcePath, resource, "engine: 'rust'"]
  ]
  for (const [path, source, marker] of required) {
    if (!source.includes(marker)) failures.push(`${path}: missing required Rust ownership marker ${JSON.stringify(marker)}`)
  }

  const forbidden = [
    [runtimePath, runtime, /from ['"]muya(?:\/lib)?['"]/],
    [runtimePath, runtime, /new\s+Muya\s*\(/],
    [addonPath, addon, /runtime\?\.engine\s*===\s*['"]muya-js['"]/],
    [addonPath, addon, /MutationObserver/],
    [trustedRuntimePath, trusted, /host\?\.get\(['"]muya['"]\)/]
  ]
  for (const [path, source, pattern] of forbidden) {
    if (pattern.test(source)) failures.push(`${path}: forbidden legacy editor ownership pattern ${pattern}`)
  }
}

if (failures.length > 0) {
  console.error('[rust-editor-ownership] FAILED')
  for (const failure of failures) console.error(`[rust-editor-ownership] ${failure}`)
  process.exit(1)
}

console.log('[rust-editor-ownership] OK: production editor and addon integration are Rust-owned')
