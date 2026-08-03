#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'elephant-proof-status-'))
const evidenceRoot = join(temporaryRoot, 'evidence')
const outputPath = join(temporaryRoot, 'summary.json')
const script = resolve(root, 'build/scripts/write-three-layer-proof-status.mjs')

const run = (conclusion) => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ELEPHANT_PROOF_EVIDENCE_ROOT: evidenceRoot,
      ELEPHANT_PROOF_STATUS_PATH: outputPath,
      ELEPHANT_UPSTREAM_CONCLUSION: conclusion,
      ELEPHANT_PROOF_HEAD_SHA: 'proof-status-self-test'
    }
  })
  if (result.status !== 0) {
    throw new Error(`proof status writer failed for ${conclusion}:\n${result.stdout || ''}\n${result.stderr || ''}`)
  }
  return JSON.parse(readFileSync(outputPath, 'utf8'))
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const writeEvidence = (relativePath, payload) => {
  const path = join(evidenceRoot, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

try {
  const failed = run('failure')
  assert(failed.status === 'NOT PROVEN', 'failed upstream workflow cannot be summarized as PROVEN')
  assert(failed.categories.every((category) => category.availability === 'MISSING'), 'all absent evidence must be explicit MISSING')
  assert(failed.categories.every((category) => category.status === 'BLOCKED'), 'missing evidence after failure must be BLOCKED')

  const cancelled = run('cancelled')
  assert(cancelled.status === 'NOT PROVEN', 'cancelled upstream workflow cannot be summarized as PROVEN')
  assert(cancelled.categories.every((category) => category.status === 'SKIPPED'), 'missing evidence after cancellation must be SKIPPED')

  writeEvidence('test-results/trusted/backend-contract/latest.json', {
    status: 'PROVEN',
    scenarios: [{ id: 'backend-note-crud-roundtrip', ok: true }]
  })
  const partial = run('failure')
  const backend = partial.categories.find((category) => category.id === 'backend-contract')
  assert(backend?.availability === 'PRESENT' && backend?.status === 'PROVEN', 'present valid backend evidence must remain PROVEN')
  assert(partial.categories.filter((category) => category.id !== 'backend-contract').every((category) => category.status === 'BLOCKED'), 'unreached layers must remain BLOCKED')
  assert(partial.status === 'NOT PROVEN', 'partial proof cannot make the overall result PROVEN')

  writeEvidence('test-results/trusted/frontend-behavior/latest.json', {
    status: 'NOT PROVEN',
    scenarios: [{ id: 'frontend-editor-keyboard-autosave', ok: false }],
    error: 'synthetic frontend failure'
  })
  const explicitFailure = run('failure')
  const frontend = explicitFailure.categories.find((category) => category.id === 'frontend-behavior')
  assert(frontend?.availability === 'PRESENT' && frontend?.status === 'NOT PROVEN', 'present failing evidence must remain explicit NOT PROVEN')
  assert(frontend?.failedScenarioIds?.includes('frontend-editor-keyboard-autosave'), 'failing scenario id must be preserved')

  writeEvidence('test-results/trusted/packaged-user-journey/latest.json', { status: 'INVALID' })
  const malformed = run('success')
  const packaged = malformed.categories.find((category) => category.id === 'packaged-user-journey')
  assert(packaged?.status === 'NOT PROVEN', 'invalid evidence status must fail closed')
  assert(malformed.status === 'NOT PROVEN', 'malformed evidence cannot make the overall result PROVEN')

  console.log('[three-layer-proof-status-self-test] OK: MISSING, BLOCKED, SKIPPED, NOT PROVEN and partial evidence all fail closed')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
