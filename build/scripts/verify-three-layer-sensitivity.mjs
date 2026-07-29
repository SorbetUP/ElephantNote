#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

// Hosted runners can spend a long time starting and stopping the exact AppImage,
// particularly during the packaged user mutation while WebKit and the native
// add-on payload are under I/O pressure. A timeout is only an execution budget:
// every negative assertion, failed scenario and mutation marker remains strict.
const mutationTimeoutMs = 30 * 60_000
const maximumAttempts = 3

for (const specification of cases) {
  let result = null
  let payload = null
  let scenario = null
  let markerObserved = false
  let artifactExists = false
  let startedAt = 0

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    console.log(`[three-layer-sensitivity] expecting ${specification.layer} to fail for ${specification.mutation} (attempt ${attempt}/${maximumAttempts})`)
    startedAt = Date.now()
    result = spawnSync(process.execPath, [resolve(root, specification.runner)], {
      cwd: root,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        ELEPHANT_LAYER_MUTATION: specification.mutation
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: mutationTimeoutMs,
      maxBuffer: 64 * 1024 * 1024
    })

    const stdout = result.stdout || ''
    const stderr = result.stderr || ''
    const combinedOutput = `${stdout}\n${stderr}`
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)

    const artifactPath = resolve(root, specification.artifact)
    artifactExists = existsSync(artifactPath)
    payload = artifactExists
      ? JSON.parse(readFileSync(artifactPath, 'utf8'))
      : null
    scenario = (payload?.scenarios || []).find((entry) => entry.id === specification.scenarioId)
    // The mutation import writes directly to stderr, but Node and CI wrappers may
    // merge child streams. Prove that the exact marker was emitted by the child
    // process without making stream routing part of the behavioral assertion.
    markerObserved = combinedOutput.includes(specification.outputMarker)
    const observation = {
      layer: specification.layer,
      mutation: specification.mutation,
      attempt,
      exitStatus: result.status,
      signal: result.signal || null,
      spawnError: result.error?.message || null,
      artifactExists,
      artifactStatus: payload?.status || null,
      expectedScenario: specification.scenarioId,
      scenarioFound: Boolean(scenario),
      scenarioOk: scenario?.ok ?? null,
      failedScenarioIds: (payload?.scenarios || []).filter((entry) => entry.ok !== true).map((entry) => entry.id),
      markerObserved,
      artifactError: payload?.error || null,
      durationMs: Date.now() - startedAt
    }
    console.log(`[three-layer-sensitivity] observation ${JSON.stringify(observation)}`)

    if (markerObserved || result.error || attempt === maximumAttempts) break
    console.warn(`[three-layer-sensitivity] mutation marker not reached; retrying the complete real runner without relaxing any assertion`)
  }

  if (result.error) {
    throw new Error(`${specification.layer} mutation process failed after ${Date.now() - startedAt}ms: ${result.error.stack || result.error.message || result.error}`)
  }
  if (!artifactExists) {
    throw new Error(`${specification.layer} mutation did not produce ${specification.artifact}`)
  }
  if (result.status === 0) {
    throw new Error(`${specification.layer} remained green under deliberate mutation ${specification.mutation}`)
  }
  if (payload.status !== 'NOT PROVEN') {
    throw new Error(`${specification.layer} did not report NOT PROVEN under ${specification.mutation}: ${JSON.stringify(payload)}`)
  }
  if (!scenario || scenario.ok !== false) {
    throw new Error(`${specification.mutation} did not fail ${specification.scenarioId}: ${JSON.stringify(payload.scenarios)}`)
  }
  if (!markerObserved) {
    throw new Error(`${specification.mutation} was not observed in runner output`)
  }
  console.log(`[three-layer-sensitivity] PASS: ${specification.layer} became red under ${specification.mutation} in ${Date.now() - startedAt}ms`)
}

console.log('[three-layer-sensitivity] PASS: backend, frontend and packaged user proof all detect deliberate regressions')
