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
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function runnerContractErrors(source) {
  const failures = []
  const requireMatch = (pattern, message) => {
    if (!pattern.test(source)) failures.push(message)
  }

  for (const id of manifest.requiredFeatures) {
    requireMatch(
      new RegExp(`["']${escapeRegExp(id)}["']\\s*:`),
      `Runner is missing an independent handler for ${id}.`
    )
  }

  const runPattern = /(?:async\s+function\s+run\s*\(\s*id\s*\)|const\s+runFeature\s*=\s*async\s*\(\s*id\s*\)\s*=>)\s*\{/
  const loopPattern = /for\s*\(\s*const\s+id\s+of\s+(?:M|manifest)\.requiredFeatures\s*\)/
  const runStart = source.search(runPattern)
  const loopStart = source.search(loopPattern)
  const harnessStart = source.search(/createRealAppHarness\s*\(/)
  if (!(runStart >= 0 && harnessStart > runStart && loopStart > harnessStart)) {
    failures.push('A fresh real-app harness must be created inside the per-feature runner before the manifest loop.')
  }
  if ((source.match(/createRealAppHarness\s*\(/g) || []).length !== 1) {
    failures.push('Runner must contain exactly one harness construction site, invoked once per feature.')
  }

  const contracts = [
    [/suite\s*:\s*`packaged-feature-\$\{id\}`/, 'Each feature must receive its own packaged-feature-${id} harness suite.'],
    [/requirePackagedApp\s*:\s*true/, 'Every feature harness must require the packaged executable.'],
    [/finally\s*\{[\s\S]{0,240}?await\s+(?:h|harness)\.cleanup\s*\(\s*\)/, 'Every feature harness must be cleaned up in finally.'],
    [/for\s*\(\s*const\s+id\s+of\s+(?:M|manifest)\.requiredFeatures\s*\)[\s\S]{0,500}?await\s+(?:run|runFeature)\s*\(\s*id\s*\)/, 'Runner must execute every manifest feature serially and independently.'],
    [/await\s+(?:F|featureDefinitions)\s*\[\s*id\s*\]\s*\(\s*(?:h|harness)\s*\)/, 'The per-feature runner must execute only the selected feature handler.'],
    [/status\s*:\s*(?:e|error)\s*\?\s*["']NOT PROVEN["']\s*:\s*["']PROVEN["']/, 'Per-feature verdict must fail closed to NOT PROVEN on error.'],
    [/artifact\s*:\s*`test-results\/trusted\/packaged-feature-\$\{id\}\/latest\.json`/, 'Every feature must expose its own evidence artifact path.'],
    [/missing\s*=\s*(?:M|manifest)\.requiredFeatures\.filter/, 'Aggregate verdict must check every required feature.'],
    [/if\s*\(\s*missing\.length\s*\)\s*\{?[\s\S]{0,180}?process\.exit\s*\(\s*1\s*\)/, 'Aggregate runner must exit non-zero when any feature is not proven.']
  ]
  for (const [pattern, message] of contracts) requireMatch(pattern, message)
  return failures
}

assert(Array.isArray(manifest.requiredFeatures), 'requiredFeatures must be an array.')
assert(manifest.requiredFeatures.length >= 20, 'Feature matrix must contain at least twenty independent features.')
assert(new Set(manifest.requiredFeatures).size === manifest.requiredFeatures.length, 'Feature ids must be unique.')
errors.push(...runnerContractErrors(runner))

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
  runner.replace(/(["'])drop-image-into-note\1\s*:/, "'removed-drop-image':"),
  runner.replace(/requirePackagedApp\s*:\s*true/, 'requirePackagedApp: false'),
  runner.replace(/await\s+(?:h|harness)\.cleanup\s*\(\s*\)/, '/* cleanup removed */'),
  runner.replace(/for\s*\(\s*const\s+id\s+of\s+(?:M|manifest)\.requiredFeatures\s*\)/, 'for (const id of [])'),
  runner.replace(/suite\s*:\s*`packaged-feature-\$\{id\}`/, "suite: 'shared-suite'")
]
for (const [index, mutated] of mutations.entries()) {
  assert(mutated !== runner, `Guard self-test mutation ${index + 1} did not alter the runner.`)
  assert(runnerContractErrors(mutated).length > 0, `Guard self-test did not reject mutation ${index + 1}.`)
}

if (errors.length) {
  console.error('[packaged-feature-matrix] contract guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`[packaged-feature-matrix] contract passed for ${manifest.requiredFeatures.length} isolated packaged features`)
