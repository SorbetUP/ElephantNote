#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))
const failures = []

const fail = (message) => {
  failures.push(message)
  console.error(`[proof-layers] FAIL ${message}`)
}
const pass = (message, detail = undefined) => {
  console.log(`[proof-layers] PASS ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)
}

const manifestPath = 'tests/trust/test-layers.json'
const manifest = readJson(manifestPath)
const packageJson = readJson('package.json')
const workflow = readText('.github/workflows/e2e.yml')
const expectedCategoryIds = ['backend-contract', 'frontend-behavior', 'packaged-user-journey']

if (manifest.schemaVersion !== 1) fail(`unsupported schemaVersion ${manifest.schemaVersion}`)
if (manifest.productProofCommand !== 'pnpm test') fail('productProofCommand must remain exactly "pnpm test"')

const categories = Array.isArray(manifest.categories) ? manifest.categories : []
const categoryIds = categories.map((category) => category.id)
if (JSON.stringify(categoryIds) !== JSON.stringify(expectedCategoryIds)) {
  fail(`proof categories must be exactly ${JSON.stringify(expectedCategoryIds)}, received ${JSON.stringify(categoryIds)}`)
} else {
  pass('exact proof category split', categoryIds)
}

const syntaxFiles = [
  'build/scripts/lib/real-app-harness.mjs',
  'build/scripts/run-backend-contract-trust.mjs',
  'build/scripts/run-frontend-behavior-trust.mjs',
  'build/scripts/run-packaged-user-journey-trust.mjs',
  'build/scripts/three-layer-fetch-mutation.mjs',
  'build/scripts/verify-three-layer-sensitivity.mjs',
  'build/scripts/run-markdown-editor-trust.mjs',
  'build/scripts/verify-test-trust.mjs',
  'build/scripts/validate-feature-matrix.mjs'
]
for (const relativePath of syntaxFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`${relativePath} is missing`)
    continue
  }
  const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], {
    cwd: root,
    encoding: 'utf8'
  })
  if (result.status !== 0) fail(`${relativePath} does not parse: ${String(result.stderr || result.stdout || '').trim()}`)
  else pass('JavaScript syntax', relativePath)
}

for (const category of categories) {
  if (!category?.id || !category?.command || !category?.runner || !category?.artifact) {
    fail(`category is incomplete: ${JSON.stringify(category)}`)
    continue
  }
  const runnerPath = path.join(root, category.runner)
  if (!fs.existsSync(runnerPath)) {
    fail(`${category.id} runner is missing: ${category.runner}`)
    continue
  }
  const source = fs.readFileSync(runnerPath, 'utf8')
  const scriptName = category.command.replace(/^pnpm\s+/, '')
  const packageCommand = String(packageJson.scripts?.[scriptName] || '')
  if (!packageCommand.includes(path.basename(category.runner))) {
    fail(`${category.id} package command ${scriptName} does not execute ${category.runner}`)
  }
  const scenarios = Array.isArray(category.requiredScenarios) ? category.requiredScenarios : []
  if (scenarios.length < 4) fail(`${category.id} has too few mandatory scenarios (${scenarios.length})`)
  for (const scenarioId of scenarios) {
    if (!source.includes(`'${scenarioId}'`)) fail(`${category.id} runner is missing executable scenario ${scenarioId}`)
  }
  if (!source.includes("status: 'PROVEN'") || !source.includes("status: 'NOT PROVEN'")) {
    fail(`${category.id} runner must emit both PROVEN and NOT PROVEN evidence`)
  }
  if (!source.includes('await harness.writeEvidence')) fail(`${category.id} runner does not persist structured evidence`)

  for (const forbidden of category.forbiddenProofCommands || []) {
    const forbiddenAction = new RegExp(`harness\\.action\\([^\\n]*['\"]${forbidden}['\"]`)
    if (forbiddenAction.test(source)) {
      fail(`${category.id} uses forbidden internal command ${forbidden} inside a claimed frontend/user action`)
    }
  }
  pass('category runner wiring', { id: category.id, scenarios: scenarios.length, artifact: category.artifact })
}

const backendSource = readText('build/scripts/run-backend-contract-trust.mjs')
for (const marker of ['tauri_notes_write', 'tauri_notes_read', 'tauri_entries_rename', 'tauri_entries_move', 'tauri_entries_delete', "restart({ crash: true })"]) {
  if (!backendSource.includes(marker)) fail(`backend-contract runner omits production marker ${marker}`)
}

const frontendSource = readText('build/scripts/run-frontend-behavior-trust.mjs')
for (const marker of [
  "harness.action(layer, 'click'",
  "harness.action(layer, 'fill'",
  "harness.action(layer, 'press'",
  "harness.action(layer, 'insertText'",
  "harness.action(layer, 'readDom'",
  'waitForVaultFile'
]) {
  if (!frontendSource.includes(marker)) fail(`frontend-behavior runner omits real frontend marker ${marker}`)
}

const userSource = readText('build/scripts/run-packaged-user-journey-trust.mjs')
for (const marker of ['requirePackagedApp: true', "restart({ crash: true })", 'waitForVaultFile', "harness.action(layer, 'logs'")]) {
  if (!userSource.includes(marker)) fail(`packaged-user-journey runner omits release proof marker ${marker}`)
}

const mutationSource = readText('build/scripts/three-layer-fetch-mutation.mjs')
const sensitivitySource = readText('build/scripts/verify-three-layer-sensitivity.mjs')
for (const marker of ['backend-ignore-note-write', 'frontend-ignore-enter', 'user-ignore-insert-text']) {
  if (!mutationSource.includes(marker) || !sensitivitySource.includes(marker)) fail(`three-layer sensitivity omits mutation ${marker}`)
}
for (const category of categories) {
  if (!sensitivitySource.includes(category.id)) fail(`three-layer sensitivity omits category ${category.id}`)
}

const scripts = packageJson.scripts || {}
for (const scriptName of ['test:backend:raw', 'test:frontend:raw', 'test:user:packaged:raw', 'test:layers:sensitivity']) {
  if (!scripts[scriptName]) fail(`package.json is missing ${scriptName}`)
}
const defaultChain = `${scripts.test || ''} ${scripts['test:raw'] || ''}`
for (const marker of ['test:trust:guard', 'test:backend:raw', 'test:frontend:raw', 'test:user:packaged:raw']) {
  if (!defaultChain.includes(marker)) fail(`default product proof chain omits ${marker}`)
}

for (const marker of [
  'pnpm test:backend:raw',
  'pnpm test:frontend:raw',
  'pnpm test:user:packaged:raw',
  'pnpm test:layers:sensitivity',
  'three-layer-sensitivity.txt',
  'test-results/trusted/backend-contract/**',
  'test-results/trusted/frontend-behavior/**',
  'test-results/trusted/packaged-user-journey/**'
]) {
  if (!workflow.includes(marker)) fail(`E2E workflow does not execute or retain ${marker}`)
}

if (failures.length > 0) {
  console.error(`[proof-layers] Validation failed with ${failures.length} error(s)`)
  process.exit(1)
}

console.log('[proof-layers] COMPLETE: wiring is valid. This command validates test architecture only; runtime proof comes exclusively from the three real-app artifacts.')
