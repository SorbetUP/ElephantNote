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

try {
  git(['worktree', 'add', '--detach', worktree, 'HEAD'])

  const invalidTestPath = join(worktree, 'tests', 'trust', 'fixtures', 'invalid.test.js')
  mkdirSync(resolve(invalidTestPath, '..'), { recursive: true })
  writeFileSync(invalidTestPath, "throw new Error('synthetic test must never be accepted')\n", 'utf8')
  git(['add', 'tests/trust/fixtures/invalid.test.js'], { cwd: worktree })
  requireRejected('tracked invalid JavaScript test', 'tracked legacy JavaScript test files are forbidden')

  resetWorktree()

  const manifestPath = join(worktree, 'tests', 'trust', 'required-scenarios.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.markdownEditor = manifest.markdownEditor.filter((scenario) => scenario.id !== 'plain-return')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  requireRejected('mutation manifest missing plain-return', 'missing mandatory scenario(s): plain-return')

  console.log('[test-trust-negative] OK: both mandatory negative fixtures turn the trust gate red')
} finally {
  try {
    git(['worktree', 'remove', '--force', worktree])
  } catch (error) {
    console.error(`[test-trust-negative] worktree cleanup warning: ${error?.message || String(error)}`)
  }
  rmSync(temporaryRoot, { recursive: true, force: true })
}
