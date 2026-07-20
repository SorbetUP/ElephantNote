#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const workflowsRoot = join(root, '.github', 'workflows')
const reportRoot = join(root, 'test-results', 'trust')
const ignoredDirectories = new Set([
  '.git', '.pnpm', 'node_modules', 'target', 'dist', 'coverage', '.cache'
])
const failures = []
const inventory = {
  scannedRepositoryFiles: 0,
  forbiddenLegacyTestFiles: [],
  forbiddenWorkflowReferences: [],
  forbiddenPackageScripts: [],
  forbiddenDevDependencies: [],
  forbiddenConfigFiles: []
}

const normalized = (path) => relative(root, path).replaceAll('\\', '/')
const read = (path) => readFileSync(path, 'utf8')
const walk = (directory) => {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      if (ignoredDirectories.has(entry)) continue
      if (normalized(path) === 'build/out') continue
      files.push(...walk(path))
    } else {
      files.push(path)
    }
  }
  return files
}

const repositoryFiles = walk(root)
const legacyTests = repositoryFiles.filter((path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path))
inventory.scannedRepositoryFiles = repositoryFiles.length
for (const path of legacyTests) {
  const file = normalized(path)
  inventory.forbiddenLegacyTestFiles.push(file)
  failures.push(`${file}: legacy JavaScript test files are forbidden; use a Rust contract test or a real Tauri automation scenario`)
}

for (const relativePath of [
  'vitest.config.js',
  'vitest.critical.config.js',
  'build/scripts/verify-test-integrity.mjs',
  'build/scripts/test-integrity-core.mjs'
]) {
  if (!existsSync(join(root, relativePath))) continue
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
for (const path of walk(workflowsRoot).filter((candidate) => /\.ya?ml$/.test(candidate))) {
  const source = read(path)
  const matches = [...source.matchAll(forbiddenWorkflowPattern)].map((match) => match[0])
  if (matches.length === 0) continue
  const file = normalized(path)
  inventory.forbiddenWorkflowReferences.push({ file, matches: [...new Set(matches)] })
  failures.push(`${file}: workflow still references the removed legacy JS test system (${[...new Set(matches)].join(', ')})`)
}

const requiredScripts = {
  'test:trust:guard': 'verify-test-trust.mjs',
  'test:markdown:trusted:raw': 'run-markdown-editor-trust.mjs'
}
for (const [name, marker] of Object.entries(requiredScripts)) {
  if (!String(scripts[name] || '').includes(marker)) failures.push(`package.json: script ${name} must contain ${marker}`)
}
const defaultTestChain = [scripts.test, scripts['test:raw'], scripts['test:markdown:trusted']].join(' ')
if (!defaultTestChain.includes('test:trust:guard')) failures.push('package.json: default test chain must run the test-trust guard')
if (!defaultTestChain.includes('test:markdown:trusted')) failures.push('package.json: default test chain must run the real Markdown editor trust suite')

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
  for (const scenario of manifest.markdownEditor || []) {
    if (!scenario?.id || !runner.includes(`'${scenario.id}'`)) {
      failures.push(`run-markdown-editor-trust.mjs: missing mandatory scenario ${JSON.stringify(scenario?.id)}`)
    }
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
    "ELEPHANT_TRUST_MUTATION: 'ignore-enter'",
    "plainReturn.ok !== false",
    'result.status === 0'
  ]) {
    if (!sensitivity.includes(marker)) failures.push(`verify-markdown-trust-sensitivity.mjs: missing sensitivity marker ${marker}`)
  }
  for (const marker of [
    "payload?.command === 'press'",
    "payload?.args?.[1] === 'Enter'",
    'swallowed real Enter command'
  ]) {
    if (!mutation.includes(marker)) failures.push(`markdown-trust-fetch-mutation.mjs: missing Enter mutation marker ${marker}`)
  }
}

const e2eWorkflow = read(join(root, '.github', 'workflows', 'e2e.yml'))
if (!e2eWorkflow.includes('pnpm test:trust:guard')) failures.push('.github/workflows/e2e.yml: must run the test-trust guard')
if (!e2eWorkflow.includes('pnpm test:markdown:trusted:raw')) failures.push('.github/workflows/e2e.yml: must run the packaged Markdown trust suite')
if (!e2eWorkflow.includes('verify-markdown-trust-sensitivity.mjs')) failures.push('.github/workflows/e2e.yml: must prove the Markdown suite turns red when Enter is broken')

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
  note: 'Only Rust contract tests and real application automation may be used as evidence.',
  inventory,
  failures
}
writeFileSync(join(reportRoot, 'test-inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`[test-trust] scanned-repository-files=${inventory.scannedRepositoryFiles}`)
console.log(`[test-trust] forbidden-legacy-test-files=${inventory.forbiddenLegacyTestFiles.length}`)
console.log(`[test-trust] forbidden-workflow-references=${inventory.forbiddenWorkflowReferences.length}`)
console.log(`[test-trust] forbidden-package-scripts=${inventory.forbiddenPackageScripts.length}`)
console.log(`[test-trust] forbidden-config-files=${inventory.forbiddenConfigFiles.length}`)
console.log(`[test-trust] report=${normalized(join(reportRoot, 'test-inventory.json'))}`)

if (failures.length > 0) {
  console.error('[test-trust] FAILED')
  for (const failure of failures) console.error(`[test-trust] ${failure}`)
  process.exit(1)
}

console.log('[test-trust] OK: no legacy JavaScript test suite remains anywhere in the repository; product proof uses the real application and proves mutation sensitivity')
