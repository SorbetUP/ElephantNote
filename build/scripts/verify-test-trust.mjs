#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const reportRoot = join(root, 'test-results', 'trust')
const failures = []
const inventory = {
  scannedRepositoryFiles: 0,
  forbiddenLegacyTestFiles: [],
  forbiddenWorkflowReferences: [],
  forbiddenPackageScripts: [],
  forbiddenDevDependencies: [],
  forbiddenConfigFiles: [],
  proofCategories: []
}

const normalized = (path) => relative(root, path).replaceAll('\\', '/')
const read = (path) => readFileSync(path, 'utf8')
const trackedFiles = () => {
  let output
  try {
    output = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    failures.push(`git ls-files failed: ${error?.stderr || error?.message || String(error)}`)
    return []
  }
  return output
    .split('\0')
    .filter(Boolean)
    .map((path) => join(root, path))
    .filter(existsSync)
}

const repositoryFiles = trackedFiles()
inventory.scannedRepositoryFiles = repositoryFiles.length

const legacyTests = repositoryFiles.filter((path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path))
for (const path of legacyTests) {
  const file = normalized(path)
  inventory.forbiddenLegacyTestFiles.push(file)
  failures.push(`${file}: tracked legacy JavaScript test files are forbidden; use a Rust contract test or a real Tauri automation scenario`)
}

for (const relativePath of [
  'vitest.config.js',
  'vitest.critical.config.js',
  'build/scripts/verify-test-integrity.mjs',
  'build/scripts/test-integrity-core.mjs'
]) {
  if (!repositoryFiles.some((path) => normalized(path) === relativePath)) continue
  inventory.forbiddenConfigFiles.push(relativePath)
  failures.push(`${relativePath}: obsolete JavaScript test configuration or synthetic counter is forbidden`)
}

const packageJson = JSON.parse(read(join(root, 'package.json')))
const scripts = packageJson.scripts || {}
for (const name of Object.keys(scripts)) {
  const value = String(scripts[name] || '')
  if (/vitest|test:legacy|test:unit|coverage:unit/.test(`${name} ${value}`)) {
    inventory.forbiddenPackageScripts.push({ name, value })
    failures.push(`package.json: forbidden legacy test script ${name}=${JSON.stringify(value)}`)
  }
}
for (const dependency of ['vitest', '@vitest/coverage-v8', 'jsdom']) {
  if (packageJson.devDependencies?.[dependency] || packageJson.dependencies?.[dependency]) {
    inventory.forbiddenDevDependencies.push(dependency)
    failures.push(`package.json: forbidden legacy test dependency ${dependency}`)
  }
}

const forbiddenWorkflowPattern = /\bvitest\b|tests\/app\/unit|tests\/elephant\/unit|test:unit|test:legacy|coverage:unit/g
for (const path of repositoryFiles.filter((candidate) => normalized(candidate).startsWith('.github/workflows/') && /\.ya?ml$/.test(candidate))) {
  const source = read(path)
  const matches = [...source.matchAll(forbiddenWorkflowPattern)].map((match) => match[0])
  if (matches.length === 0) continue
  const file = normalized(path)
  inventory.forbiddenWorkflowReferences.push({ file, matches: [...new Set(matches)] })
  failures.push(`${file}: workflow still references the removed legacy JS test system (${[...new Set(matches)].join(', ')})`)
}

const requiredScripts = {
  'test:trust:guard': 'verify-test-trust.mjs',
  'test:backend:raw': 'run-backend-contract-trust.mjs',
  'test:markdown:trusted:raw': 'run-markdown-editor-trust.mjs',
  'test:frontend:behavior:raw': 'run-frontend-behavior-trust.mjs',
  'test:user:packaged:raw': 'run-packaged-user-journey-trust.mjs',
  'test:layers:sensitivity': 'verify-three-layer-sensitivity.mjs'
}
for (const [name, marker] of Object.entries(requiredScripts)) {
  if (!String(scripts[name] || '').includes(marker)) failures.push(`package.json: script ${name} must contain ${marker}`)
}
const defaultTestChain = `${scripts.test || ''} ${scripts['test:raw'] || ''}`
for (const marker of ['test:trust:guard', 'test:backend:raw', 'test:frontend:raw', 'test:user:packaged:raw']) {
  if (!defaultTestChain.includes(marker)) failures.push(`package.json: default product proof chain must run ${marker}`)
}
if (!String(scripts['test:frontend:raw'] || '').includes('test:markdown:trusted:raw')) {
  failures.push('package.json: frontend proof must include the real Markdown editor trust suite')
}

const layersManifestPath = join(root, 'tests', 'trust', 'test-layers.json')
const expectedCategories = ['backend-contract', 'frontend-behavior', 'packaged-user-journey']
if (!existsSync(layersManifestPath)) {
  failures.push('tests/trust/test-layers.json: missing')
} else {
  const manifest = JSON.parse(read(layersManifestPath))
  if (manifest.productProofCommand !== 'pnpm test') failures.push('tests/trust/test-layers.json: productProofCommand must remain exactly "pnpm test"')
  const categories = Array.isArray(manifest.categories) ? manifest.categories : []
  const ids = categories.map((category) => category.id)
  inventory.proofCategories = ids
  if (JSON.stringify(ids) !== JSON.stringify(expectedCategories)) {
    failures.push(`tests/trust/test-layers.json: categories must be exactly ${JSON.stringify(expectedCategories)}`)
  }
  for (const category of categories) {
    const runnerPath = join(root, category.runner || '')
    if (!category.runner || !existsSync(runnerPath)) {
      failures.push(`tests/trust/test-layers.json: missing runner for ${category.id}`)
      continue
    }
    const runner = read(runnerPath)
    for (const scenarioId of category.requiredScenarios || []) {
      if (!runner.includes(`'${scenarioId}'`)) failures.push(`${category.runner}: missing mandatory scenario ${scenarioId}`)
    }
    if (!runner.includes("status: 'PROVEN'") || !runner.includes("status: 'NOT PROVEN'")) {
      failures.push(`${category.runner}: must emit explicit PROVEN and NOT PROVEN evidence`)
    }
    for (const forbidden of category.forbiddenProofCommands || []) {
      const actionPattern = new RegExp(`harness\\.action\\([^\\n]*['\"]${forbidden}['\"]`)
      if (actionPattern.test(runner)) failures.push(`${category.runner}: forbidden internal proof action ${forbidden}`)
    }
    if (category.requiresPackagedExecutable === true && !runner.includes('requirePackagedApp: true')) {
      failures.push(`${category.runner}: packaged user proof must reject development launchers`)
    }
  }
}

const layerSensitivityPath = join(root, 'build', 'scripts', 'verify-three-layer-sensitivity.mjs')
const layerMutationPath = join(root, 'build', 'scripts', 'three-layer-fetch-mutation.mjs')
if (!existsSync(layerSensitivityPath)) failures.push('build/scripts/verify-three-layer-sensitivity.mjs: missing')
if (!existsSync(layerMutationPath)) failures.push('build/scripts/three-layer-fetch-mutation.mjs: missing')
if (existsSync(layerSensitivityPath) && existsSync(layerMutationPath)) {
  const sensitivity = read(layerSensitivityPath)
  const mutation = read(layerMutationPath)
  for (const marker of ['backend-ignore-note-write', 'frontend-ignore-enter', 'user-ignore-insert-text']) {
    if (!sensitivity.includes(marker)) failures.push(`verify-three-layer-sensitivity.mjs: missing mutation ${marker}`)
    if (!mutation.includes(marker)) failures.push(`three-layer-fetch-mutation.mjs: missing mutation ${marker}`)
  }
  for (const marker of expectedCategories) {
    if (!sensitivity.includes(marker)) failures.push(`verify-three-layer-sensitivity.mjs: missing proof category ${marker}`)
  }
  if (!sensitivity.includes("payload.status !== 'NOT PROVEN'") && !sensitivity.includes("payload.status !== \"NOT PROVEN\"")) {
    failures.push('verify-three-layer-sensitivity.mjs: must require NOT PROVEN under every mutation')
  }
}

const manifestPath = join(root, 'tests', 'trust', 'required-scenarios.json')
const runnerPath = join(root, 'build', 'scripts', 'run-markdown-editor-trust.mjs')
const sensitivityPath = join(root, 'build', 'scripts', 'verify-markdown-trust-sensitivity.mjs')
const mutationPath = join(root, 'build', 'scripts', 'markdown-trust-fetch-mutation.mjs')
if (!existsSync(manifestPath)) failures.push('tests/trust/required-scenarios.json: missing')
if (!existsSync(runnerPath)) failures.push('build/scripts/run-markdown-editor-trust.mjs: missing')
if (!existsSync(sensitivityPath)) failures.push('build/scripts/verify-markdown-trust-sensitivity.mjs: missing')
if (!existsSync(mutationPath)) failures.push('build/scripts/markdown-trust-fetch-mutation.mjs: missing')
if (existsSync(manifestPath) && existsSync(runnerPath)) {
  const manifest = JSON.parse(read(manifestPath))
  const runner = read(runnerPath)
  if (manifest.productProofCommand !== 'pnpm test') failures.push('tests/trust/required-scenarios.json: productProofCommand must remain exactly "pnpm test"')
  if ('legacyDiagnosticCommand' in manifest) failures.push('tests/trust/required-scenarios.json: legacyDiagnosticCommand is forbidden')
  if (!Array.isArray(manifest.markdownEditor) || manifest.markdownEditor.length === 0) failures.push('tests/trust/required-scenarios.json: markdownEditor must contain mandatory real-app scenarios')
  for (const scenario of manifest.markdownEditor || []) {
    if (!scenario?.id || !runner.includes(`'${scenario.id}'`)) failures.push(`run-markdown-editor-trust.mjs: missing mandatory scenario ${JSON.stringify(scenario?.id)}`)
  }
  for (const marker of [
    "command('press'",
    "command('selectText'",
    "command('insertText'",
    "command('readState'",
    "command('save'",
    "command('readNote'",
    "command('logs'",
    'await stopChild()',
    'await startChild()'
  ]) {
    if (!runner.includes(marker)) failures.push(`run-markdown-editor-trust.mjs: missing real behavior marker ${marker}`)
  }
}
if (existsSync(sensitivityPath) && existsSync(mutationPath)) {
  const sensitivity = read(sensitivityPath)
  const mutation = read(mutationPath)
  for (const marker of [
    "mutation: 'ignore-enter'",
    "mutation: 'ignore-insert-text'",
    "scenarioId: 'plain-return'",
    'result.status === 0'
  ]) {
    if (!sensitivity.includes(marker)) failures.push(`verify-markdown-trust-sensitivity.mjs: missing sensitivity marker ${marker}`)
  }
  for (const marker of [
    "payload?.command === 'press'",
    "payload?.args?.[1] === 'Enter'",
    "payload?.command === 'insertText'",
    'swallowed real Enter command',
    'swallowed real insertText command'
  ]) {
    if (!mutation.includes(marker)) failures.push(`markdown-trust-fetch-mutation.mjs: missing mutation marker ${marker}`)
  }
}

const e2eWorkflow = read(join(root, '.github', 'workflows', 'e2e.yml'))
for (const marker of [
  'pnpm test:trust:guard',
  'pnpm test:backend:raw',
  'pnpm test:frontend:raw',
  'pnpm test:user:packaged:raw',
  'pnpm test:layers:sensitivity',
  'verify-markdown-trust-sensitivity.mjs',
  'three-layer-sensitivity.txt',
  'test-results/trusted/backend-contract/**',
  'test-results/trusted/frontend-behavior/**',
  'test-results/trusted/packaged-user-journey/**'
]) {
  if (!e2eWorkflow.includes(marker)) failures.push(`.github/workflows/e2e.yml: missing mandatory proof marker ${marker}`)
}

const testWorkflow = read(join(root, '.github', 'workflows', 'test.yml'))
if (!testWorkflow.includes('pnpm test:trust:guard')) failures.push('.github/workflows/test.yml: must run the test-trust guard')

const agentRules = [join(root, 'AGENTS.md'), join(root, 'tests', 'AGENTS.md')]
  .filter(existsSync)
  .map(read)
  .join('\n')
for (const marker of [
  'Legacy diagnostics are not product proof.',
  'Generated test cases are forbidden.',
  'Markdown editor changes require the real Tauri editor trust scenarios.'
]) {
  if (!agentRules.includes(marker)) failures.push(`AGENTS rules: missing mandatory test-trust rule ${JSON.stringify(marker)}`)
}

mkdirSync(reportRoot, { recursive: true })
const report = {
  at: new Date().toISOString(),
  status: failures.length === 0 ? 'PROVEN' : 'FAILED',
  note: 'The guard proves only test architecture. Runtime product proof requires passing backend-contract, frontend-behavior, and exact packaged-user-journey artifacts, plus deliberate mutation sensitivity for every layer.',
  inventory,
  failures
}
writeFileSync(join(reportRoot, 'test-inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`[test-trust] scanned-tracked-files=${inventory.scannedRepositoryFiles}`)
console.log(`[test-trust] forbidden-legacy-test-files=${inventory.forbiddenLegacyTestFiles.length}`)
console.log(`[test-trust] forbidden-workflow-references=${inventory.forbiddenWorkflowReferences.length}`)
console.log(`[test-trust] forbidden-package-scripts=${inventory.forbiddenPackageScripts.length}`)
console.log(`[test-trust] forbidden-config-files=${inventory.forbiddenConfigFiles.length}`)
console.log(`[test-trust] proof-categories=${inventory.proofCategories.join(',')}`)
console.log(`[test-trust] report=${normalized(join(reportRoot, 'test-inventory.json'))}`)

if (failures.length > 0) {
  console.error('[test-trust] FAILED')
  for (const failure of failures) console.error(`[test-trust] ${failure}`)
  process.exit(1)
}

console.log('[test-trust] OK: no tracked legacy JavaScript suite remains; product proof is split into backend, frontend, and exact packaged user journeys with mutation sensitivity')
