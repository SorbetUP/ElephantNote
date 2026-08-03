#!/usr/bin/env node

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'tests/trust/test-layers.json'), 'utf8'))
const evidenceRoot = resolve(
  root,
  process.env.ELEPHANT_PROOF_EVIDENCE_ROOT || '.'
)
const outputPath = resolve(
  root,
  process.env.ELEPHANT_PROOF_STATUS_PATH || 'test-results/trusted/summary/latest.json'
)
const upstreamConclusion = String(process.env.ELEPHANT_UPSTREAM_CONCLUSION || 'unknown').toLowerCase()
const headSha = String(process.env.ELEPHANT_PROOF_HEAD_SHA || process.env.GITHUB_SHA || '')

const missingStatus = () => {
  if (upstreamConclusion === 'cancelled' || upstreamConclusion === 'skipped') return 'SKIPPED'
  if (['failure', 'timed_out', 'action_required', 'stale'].includes(upstreamConclusion)) return 'BLOCKED'
  return 'MISSING'
}

const categories = manifest.categories.map((category) => {
  const artifactPath = resolve(evidenceRoot, category.artifact)
  if (!existsSync(artifactPath)) {
    return {
      id: category.id,
      artifact: category.artifact,
      availability: 'MISSING',
      status: missingStatus(),
      reason: `Required proof artifact was not produced before the upstream workflow concluded ${upstreamConclusion}.`
    }
  }

  try {
    const evidence = JSON.parse(readFileSync(artifactPath, 'utf8'))
    const evidenceStatus = String(evidence?.status || '')
    const validStatus = evidenceStatus === 'PROVEN' || evidenceStatus === 'NOT PROVEN'
    return {
      id: category.id,
      artifact: category.artifact,
      availability: 'PRESENT',
      status: validStatus ? evidenceStatus : 'NOT PROVEN',
      scenarioCount: Array.isArray(evidence?.scenarios) ? evidence.scenarios.length : 0,
      failedScenarioIds: Array.isArray(evidence?.scenarios)
        ? evidence.scenarios.filter((scenario) => scenario?.ok !== true).map((scenario) => scenario?.id || '<missing-id>')
        : [],
      error: evidence?.error?.message || evidence?.error || null,
      reason: validStatus ? null : `Invalid proof status ${JSON.stringify(evidenceStatus)}.`
    }
  } catch (error) {
    return {
      id: category.id,
      artifact: category.artifact,
      availability: 'PRESENT',
      status: 'NOT PROVEN',
      error: error?.message || String(error),
      reason: 'Required proof artifact is unreadable or malformed.'
    }
  }
})

const status = categories.every((category) => category.status === 'PROVEN')
  ? 'PROVEN'
  : 'NOT PROVEN'
const payload = {
  schemaVersion: 1,
  at: new Date().toISOString(),
  status,
  upstreamConclusion,
  headSha: headSha || null,
  categories
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
for (const category of categories) {
  console.log(`[three-layer-proof-status] ${category.id}: availability=${category.availability} status=${category.status}`)
}
console.log(`[three-layer-proof-status] overall=${status}; output=${outputPath}`)

if (process.env.ELEPHANT_PROOF_STATUS_FAIL_CLOSED === '1' && status !== 'PROVEN') {
  process.exitCode = 1
}
