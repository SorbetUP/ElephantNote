#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const runner = resolve(root, 'build/scripts/run-markdown-editor-trust.mjs')
const mutation = pathToFileURL(resolve(root, 'build/scripts/markdown-trust-fetch-mutation.mjs')).href
const artifact = resolve(root, 'test-results/trusted/markdown-editor/latest.json')
const existingNodeOptions = String(process.env.NODE_OPTIONS || '').trim()
const nodeOptions = [existingNodeOptions, `--import=${mutation}`].filter(Boolean).join(' ')

console.log('[markdown-trust-sensitivity] expecting the real suite to fail when Enter is swallowed')
const result = spawnSync(process.execPath, [runner], {
  cwd: root,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    ELEPHANT_TRUST_MUTATION: 'ignore-enter'
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status === 0) {
  throw new Error('Markdown trust suite remained green while every Enter command was swallowed')
}

const payload = JSON.parse(readFileSync(artifact, 'utf8'))
const plainReturn = (payload.scenarios || []).find((scenario) => scenario.id === 'plain-return')
if (payload.status !== 'NOT PROVEN') {
  throw new Error(`Mutated suite did not report NOT PROVEN: ${JSON.stringify(payload)}`)
}
if (!plainReturn || plainReturn.ok !== false) {
  throw new Error(`Mutated suite did not fail the plain-return scenario: ${JSON.stringify(payload.scenarios)}`)
}
if (!(result.stderr || '').includes('[markdown-trust-mutation] swallowed real Enter command')) {
  throw new Error('The Enter mutation was not observed in the runner output')
}

console.log('[markdown-trust-sensitivity] PASS: swallowing Enter makes plain-return red')
