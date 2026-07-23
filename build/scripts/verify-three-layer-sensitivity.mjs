#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const mutationModule = pathToFileURL(resolve(root, 'build/scripts/three-layer-fetch-mutation.mjs')).href
const existingNodeOptions = String(process.env.NODE_OPTIONS || '').trim()
const nodeOptions = [existingNodeOptions, `--import=${mutationModule}`].filter(Boolean).join(' ')

const cases = [
  {
    layer: 'backend-contract',
    runner: 'build/scripts/run-backend-contract-trust.mjs',
    artifact: 'test-results/trusted/backend-contract/latest.json',
    mutation: 'backend-ignore-note-write',
    scenarioId: 'backend-note-crud-roundtrip',
    outputMarker: '[three-layer-mutation] swallowed production tauri_notes_write'
  },
  {
    layer: 'frontend-behavior',
    runner: 'build/scripts/run-frontend-behavior-trust.mjs',
    artifact: 'test-results/trusted/frontend-behavior/latest.json',
    mutation: 'frontend-ignore-enter',
    scenarioId: 'frontend-editor-keyboard-autosave',
    outputMarker: '[three-layer-mutation] swallowed frontend Enter input'
  },
  {
    layer: 'packaged-user-journey',
    runner: 'build/scripts/run-packaged-user-journey-trust.mjs',
    artifact: 'test-results/trusted/packaged-user-journey/latest.json',
    mutation: 'user-ignore-insert-text',
    scenarioId: 'user-edit-visible-and-persisted',
    outputMarker: '[three-layer-mutation] swallowed packaged user text input'
  }
]

for (const specification of cases) {
  console.log(`[three-layer-sensitivity] expecting ${specification.layer} to fail for ${specification.mutation}`)
  const result = spawnSync(process.execPath, [resolve(root, specification.runner)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      ELEPHANT_LAYER_MUTATION: specification.mutation
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status === 0) {
    throw new Error(`${specification.layer} remained green under deliberate mutation ${specification.mutation}`)
  }

  const payload = JSON.parse(readFileSync(resolve(root, specification.artifact), 'utf8'))
  const scenario = (payload.scenarios || []).find((entry) => entry.id === specification.scenarioId)
  if (payload.status !== 'NOT PROVEN') {
    throw new Error(`${specification.layer} did not report NOT PROVEN under ${specification.mutation}: ${JSON.stringify(payload)}`)
  }
  if (!scenario || scenario.ok !== false) {
    throw new Error(`${specification.mutation} did not fail ${specification.scenarioId}: ${JSON.stringify(payload.scenarios)}`)
  }
  if (!(result.stderr || '').includes(specification.outputMarker)) {
    throw new Error(`${specification.mutation} was not observed in runner stderr`)
  }
  console.log(`[three-layer-sensitivity] PASS: ${specification.layer} became red under ${specification.mutation}`)
}

console.log('[three-layer-sensitivity] PASS: backend, frontend and packaged user proof all detect deliberate regressions')
