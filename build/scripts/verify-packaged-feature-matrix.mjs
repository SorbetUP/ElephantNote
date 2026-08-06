#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const manifest = JSON.parse(read('tests/trust/packaged-feature-matrix.json'))
const runner = read(manifest.runner)
const surface = read('Elephant/frontend/src/renderer/src/platform/automationAcceptancePhysicalSurface.js')
const main = read('Elephant/frontend/src/renderer/src/Main.vue')
const workflow = read('.github/workflows/packaged-feature-matrix.yml')
const errors = []
const assert = (condition, message) => { if (!condition) errors.push(message) }

assert(manifest.requiredFeatures.length >= 20, 'Feature matrix must contain at least twenty independent features.')
assert(new Set(manifest.requiredFeatures).size === manifest.requiredFeatures.length, 'Feature ids must be unique.')
for (const id of manifest.requiredFeatures) {
  assert(runner.includes(`'${id}'`), `Runner is missing ${id}.`)
  assert(runner.includes(`suite: \`packaged-feature-\${id}\``), 'Each feature must receive an isolated harness suite.')
}
for (const token of [
  'createRealAppHarness',
  'requirePackagedApp: true',
  'await harness.cleanup()',
  'for (const id of manifest.requiredFeatures)',
  "status: error ? 'NOT PROVEN' : 'PROVEN'",
  'process.exit(1)'
]) assert(runner.includes(token), `Runner contract is missing ${token}.`)
for (const token of ['pressShortcut', 'pasteText', 'dropFiles', 'createFolder', 'openSystemPath', 'DataTransfer', 'DragEvent']) {
  assert(surface.includes(token), `Physical automation surface is missing ${token}.`)
}
assert(main.includes('automationAcceptancePhysicalSurface.js'), 'Main renderer must install the extended acceptance surface.')
assert(workflow.includes('pnpm build:linux'), 'Feature workflow must build the Linux package.')
assert(workflow.includes('ELEPHANT_PACKAGED_FORMAT=linux-appimage'), 'Feature workflow must identify the exact AppImage format.')
assert(workflow.includes('run-packaged-feature-matrix.mjs'), 'Feature workflow must run the independent matrix.')
assert(workflow.includes('test-results/trusted/packaged-feature-*/**'), 'Feature workflow must upload every independent artifact.')
assert(workflow.includes('if-no-files-found: error'), 'Feature evidence must fail closed when absent.')

const mutations = [
  runner.replace("'drop-image-into-note'", "'removed-drop-image'"),
  runner.replace('requirePackagedApp: true', 'requirePackagedApp: false'),
  runner.replace('await harness.cleanup()', '// removed cleanup'),
  runner.replace('for (const id of manifest.requiredFeatures)', 'for (const id of [])')
]
for (const [index, mutated] of mutations.entries()) {
  const rejected =
    !manifest.requiredFeatures.every((id) => mutated.includes(`'${id}'`)) ||
    !mutated.includes('requirePackagedApp: true') ||
    !mutated.includes('await harness.cleanup()') ||
    !mutated.includes('for (const id of manifest.requiredFeatures)')
  assert(rejected, `Guard self-test did not reject mutation ${index + 1}.`)
}

if (errors.length) {
  console.error('[packaged-feature-matrix] contract guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`[packaged-feature-matrix] contract passed for ${manifest.requiredFeatures.length} isolated packaged features`)
