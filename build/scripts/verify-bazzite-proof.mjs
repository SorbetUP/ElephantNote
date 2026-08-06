#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const manifest = JSON.parse(read('tests/trust/bazzite-proof.json'))
const runner = read(manifest.runner)
const journey = read(manifest.journeyRunner)
const workflow = read('.github/workflows/bazzite-production-proof.yml')

const validate = ({ runnerSource, journeySource, workflowSource, proofManifest }) => {
  const errors = []
  const assert = (condition, message) => { if (!condition) errors.push(message) }

  assert(proofManifest.requires?.os === 'bazzite', 'Bazzite manifest must require Bazzite.')
  assert(proofManifest.requires?.sessionType === 'wayland', 'Bazzite manifest must require Wayland.')
  assert(proofManifest.requires?.desktop === 'GNOME', 'Bazzite manifest must require GNOME.')
  assert(proofManifest.requires?.gearLeverDesktopEntry === true, 'Bazzite manifest must require a Gear Lever desktop entry.')
  assert(proofManifest.requires?.selinux === 'Enforcing', 'Bazzite manifest must require enforcing SELinux.')
  assert(proofManifest.requires?.desktopPortal === 'active', 'Bazzite manifest must require an active desktop portal.')
  assert(proofManifest.requires?.exactSha256 === true, 'Bazzite manifest must require the exact SHA-256.')

  for (const token of [
    '/etc/os-release',
    'XDG_SESSION_TYPE',
    'WAYLAND_DISPLAY',
    'GNOME',
    '.local/share/applications',
    'getenforce',
    'xdg-desktop-portal.service',
    'ELEPHANT_EXPECTED_APPIMAGE_SHA256',
    'test:backend:raw',
    'test:frontend:raw',
    'test:automation:raw',
    'journalctl',
    "writeEvidence('NOT PROVEN')"
  ]) assert(runnerSource.includes(token), `Bazzite runner must contain ${token}.`)

  assert(journeySource.includes('requirePackagedApp: true'), 'Bazzite journey must require the packaged app.')
  assert(journeySource.includes("suite: 'bazzite-packaged-user-journey'"), 'Bazzite journey must have an isolated evidence suite.')
  assert(!journeySource.includes('xdotool'), 'Bazzite Wayland journey must not use xdotool.')
  assert(!journeySource.includes('xvfb'), 'Bazzite Wayland journey must not use Xvfb.')
  for (const id of proofManifest.requiredJourneyScenarios || []) {
    assert(journeySource.includes(`'${id}'`), `Bazzite journey is missing required scenario ${id}.`)
  }

  assert(workflowSource.includes('workflow_dispatch:'), 'Bazzite proof workflow must be manually dispatchable.')
  for (const label of ['self-hosted', 'bazzite', 'wayland']) {
    assert(workflowSource.includes(label), `Bazzite proof workflow must require runner label ${label}.`)
  }
  assert(workflowSource.includes('expected_sha256'), 'Bazzite proof workflow must require an expected SHA-256.')
  assert(workflowSource.includes('run-bazzite-production-proof.mjs'), 'Bazzite proof workflow must execute the production proof runner.')

  assert(workflowSource.includes('proof-status:'), 'Bazzite workflow must aggregate proof availability in a proof-status job.')
  assert(workflowSource.includes('needs: [contract, production-proof]'), 'Bazzite status must depend on contract and hardware proof jobs.')
  assert(workflowSource.includes('if: always()'), 'Bazzite status must execute even after a failure, cancellation or skip.')
  for (const status of ['NOT PROVEN', 'MISSING', 'SKIPPED', 'BLOCKED']) {
    assert(workflowSource.includes(status), `Bazzite status must expose ${status}.`)
  }
  assert(workflowSource.includes('workflow-status.json'), 'Bazzite workflow must write a structured workflow-status artifact.')
  assert(workflowSource.includes('bazzite-wayland-proof-status'), 'Bazzite workflow must upload the explicit status artifact.')
  assert(workflowSource.includes('if-no-files-found: error'), 'Bazzite workflow must fail when required evidence is absent.')
  assert(workflowSource.includes("evidence.status !== 'PROVEN'"), 'Bazzite workflow must fail closed unless the real hardware proof is PROVEN.')
  return errors
}

const valid = { runnerSource: runner, journeySource: journey, workflowSource: workflow, proofManifest: manifest }
const errors = validate(valid)

const mutations = [
  ['missing-wayland-check', { ...valid, runnerSource: runner.replace('XDG_SESSION_TYPE', 'REMOVED_SESSION_TYPE') }],
  ['x11-regression', { ...valid, journeySource: `${journey}\n// xdotool regression` }],
  ['missing-sha-contract', { ...valid, workflowSource: workflow.replaceAll('expected_sha256', 'removed_hash_input') }],
  ['missing-scenario', { ...valid, journeySource: journey.replace(manifest.requiredJourneyScenarios[0], 'removed-scenario') }],
  ['missing-fail-closed-status', { ...valid, workflowSource: workflow.replace('proof-status:', 'removed-proof-status:').replaceAll('NOT PROVEN', 'REMOVED_STATUS') }]
]
for (const [id, mutated] of mutations) {
  if (validate(mutated).length === 0) errors.push(`Bazzite guard self-test did not reject mutation: ${id}`)
}

if (errors.length) {
  console.error('[bazzite-proof] contract guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[bazzite-proof] Bazzite Wayland production-proof contract, fail-closed availability and mutation sensitivity passed')
