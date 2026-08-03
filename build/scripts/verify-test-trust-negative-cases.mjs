#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'elephant-test-trust-negative-'))
const worktree = join(temporaryRoot, 'worktree')

const git = (args, options = {}) => execFileSync('git', args, {
  cwd: options.cwd || root,
  encoding: 'utf8',
  stdio: options.stdio || ['ignore', 'pipe', 'pipe']
})

const runGuard = () => {
  const commands = [
    'build/scripts/verify-test-trust-mandatory-scenarios.mjs',
    'build/scripts/verify-test-trust.mjs'
  ]
  let output = ''
  for (const script of commands) {
    const result = spawnSync(process.execPath, [script], {
      cwd: worktree,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' }
    })
    output += `${result.stdout || ''}${result.stderr || ''}`
    if (result.status !== 0) return { status: result.status, output }
  }
  return { status: 0, output }
}

const requireAccepted = (name) => {
  const result = runGuard()
  if (result.status !== 0) {
    throw new Error(`${name}: valid trust architecture was rejected\n${result.output}`)
  }
  console.log(`[test-trust-negative] ${name}: accepted as required`)
}

const requireRejected = (name, expectedMessage) => {
  const result = runGuard()
  if (result.status === 0) {
    throw new Error(`${name}: trust guard incorrectly accepted the invalid fixture`)
  }
  if (!result.output.includes(expectedMessage)) {
    throw new Error(`${name}: guard failed for the wrong reason; expected ${JSON.stringify(expectedMessage)}\n${result.output}`)
  }
  console.log(`[test-trust-negative] ${name}: rejected as required`)
}

const resetWorktree = () => {
  git(['reset', '--hard', 'HEAD'], { cwd: worktree })
  git(['clean', '-fd'], { cwd: worktree })
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

try {
  git(['worktree', 'add', '--detach', worktree, 'HEAD'])

  requireAccepted('unmodified baseline')

  const invalidTestPath = join(worktree, 'tests', 'trust', 'fixtures', 'invalid.test.js')
  mkdirSync(resolve(invalidTestPath, '..'), { recursive: true })
  writeFileSync(invalidTestPath, "throw new Error('synthetic test must never be accepted')\n", 'utf8')
  git(['add', 'tests/trust/fixtures/invalid.test.js'], { cwd: worktree })
  requireRejected('tracked invalid JavaScript test', 'tracked legacy JavaScript test files are forbidden')

  resetWorktree()

  const manifestPath = join(worktree, 'tests', 'trust', 'required-scenarios.json')
  const missingScenarioManifest = readJson(manifestPath)
  missingScenarioManifest.markdownEditor = missingScenarioManifest.markdownEditor.filter(
    (scenario) => scenario.id !== 'plain-return'
  )
  writeJson(manifestPath, missingScenarioManifest)
  requireRejected('manifest missing plain-return', 'missing mandatory scenario(s): plain-return')

  resetWorktree()

  const renamedScenarioManifest = readJson(manifestPath)
  const plainReturn = renamedScenarioManifest.markdownEditor.find((scenario) => scenario.id === 'plain-return')
  if (!plainReturn) throw new Error('rename fixture could not locate plain-return')
  plainReturn.id = 'plain-return-renamed'
  writeJson(manifestPath, renamedScenarioManifest)
  requireRejected('manifest renamed plain-return', 'missing mandatory scenario(s): plain-return')

  resetWorktree()

  const backendRunnerPath = join(worktree, 'build', 'scripts', 'run-backend-contract-trust.mjs')
  const backendRunner = readFileSync(backendRunnerPath, 'utf8')
  if (!backendRunner.includes("status: 'PROVEN'")) {
    throw new Error('evidence fixture could not locate the explicit PROVEN write')
  }
  writeFileSync(
    backendRunnerPath,
    backendRunner.replace("status: 'PROVEN'", "status: 'PASS'"),
    'utf8'
  )
  requireRejected(
    'backend runner missing explicit PROVEN evidence',
    'build/scripts/run-backend-contract-trust.mjs: must emit explicit PROVEN and NOT PROVEN evidence'
  )

  console.log('[test-trust-negative] OK: valid architecture stays green and every mandatory invalid mutation turns the trust gate red for the expected reason')
} finally {
  try {
    git(['worktree', 'remove', '--force', worktree])
  } catch (error) {
    console.error(`[test-trust-negative] worktree cleanup warning: ${error?.message || String(error)}`)
  }
  rmSync(temporaryRoot, { recursive: true, force: true })
}
