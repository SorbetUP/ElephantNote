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

const featureBlock = (source, id) => {
  const marker = new RegExp(`["']${escapeRegExp(id)}["']\\s*:`)
  const match = marker.exec(source)
  if (!match) return ''
  const starts = manifest.requiredFeatures
    .map((other) => {
      const found = new RegExp(`["']${escapeRegExp(other)}["']\\s*:`).exec(source)
      return found?.index ?? -1
    })
    .filter((index) => index > match.index)
  const end = starts.length ? Math.min(...starts) : source.search(/\n}\s*\n\s*(?:async function run|const runFeature)/)
  return source.slice(match.index, end > match.index ? end : source.length)
}

function runnerContractErrors(source) {
  const failures = []
  const requireMatch = (pattern, message) => {
    if (!pattern.test(source)) failures.push(message)
  }

  for (const id of manifest.requiredFeatures) {
    requireMatch(new RegExp(`["']${escapeRegExp(id)}["']\\s*:`), `Runner is missing an independent handler for ${id}.`)
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
    [/if\s*\(\s*missing\.length\s*\)\s*\{?[\s\S]{0,180}?process\.exit\s*\(\s*1\s*\)/, 'Aggregate runner must exit non-zero when any feature is not proven.'],
    [/(?:createHash\s*\(|appSha256|appImageSha256)/, 'Every independent verdict must be bound to the exact AppImage SHA-256.']
  ]
  for (const [pattern, message] of contracts) requireMatch(pattern, message)

  const visibleRequirements = {
    'vault-selection': { required: [/click/, /\.en-primary/], forbidden: [/selectVault/] },
    'create-note': { required: [/click/, /en-create-button-primary/], forbidden: [/(?:set|setup)\s*\([^\n]*createNote/] },
    'create-folder': { required: [/click/, /en-create-button/], forbidden: [/(?:set|setup)\s*\([^\n]*createFolder/] },
    'excalidraw-open-close': {
      required: [/click/, /toolbar-rectangle/, /pointerDrag/, /walkVaultFiles/, /elements/, /data-entry-path/],
      forbidden: [/tauri_drawings_create/, /openExcalidraw/, /readExcalidraw/, /closeExcalidraw/]
    }
  }
  for (const [id, contract] of Object.entries(visibleRequirements)) {
    const block = featureBlock(source, id)
    for (const required of contract.required) {
      if (!required.test(block)) failures.push(`${id} must exercise its visible production control, not an internal fixture command.`)
    }
    for (const forbidden of contract.forbidden) {
      if (forbidden.test(block)) failures.push(`${id} contains a forbidden internal shortcut and cannot be marked PROVEN.`)
    }
  }

  const pdfAddon = featureBlock(source, 'pdf-addon-open-route')
  if (!/click/.test(pdfAddon) || !/pdf-addon/.test(pdfAddon) || !/readFileOpenHistory/.test(source)) {
    failures.push('pdf-addon-open-route must click a real PDF link and prove the pdf-addon route.')
  }
  const pdfFallback = featureBlock(source, 'pdf-system-open-fallback')
  if (!/click/.test(pdfFallback) || !/system-path/.test(pdfFallback) || !/(?:!routed\.error|routed\.error\s*===\s*null)/.test(pdfFallback)) {
    failures.push('pdf-system-open-fallback must click a real PDF link and prove a successful system-path route.')
  }
  if (!/waitForVaultFile/.test(featureBlock(source, 'note-realtime-autosave'))) {
    failures.push('note-realtime-autosave must verify the real vault file, not only renderer state.')
  }
  for (const id of ['drop-file-into-vault-folder', 'drop-image-into-note', 'drop-file-link-into-note']) {
    const block = featureBlock(source, id)
    if (!/act\(h, ['"]dropFiles['"]/.test(block)) failures.push(`${id} must dispatch a claimed visible renderer drop sequence.`)
    if (/(?:set|setup)\s*\([^\n]*dropFiles/.test(block)) failures.push(`${id} must not hide the drop inside fixture setup.`)
  }
  const folderDrop = featureBlock(source, 'drop-file-into-vault-folder')
  if (!/en-create-button/.test(folderDrop) || /(?:set|setup)\s*\([^\n]*createFolder/.test(folderDrop)) {
    failures.push('drop-file-into-vault-folder must create its target through the visible folder button.')
  }
  if (!/en-sidebar-tree-label/.test(folderDrop) || /, \.en-sidebar/.test(folderDrop)) {
    failures.push('drop-file-into-vault-folder must target the exact visible folder row without a sidebar fallback.')
  }
  return failures
}

assert(Array.isArray(manifest.requiredFeatures), 'requiredFeatures must be an array.')
assert(manifest.requiredFeatures.length >= 20, 'Feature matrix must contain at least twenty independent features.')
assert(new Set(manifest.requiredFeatures).size === manifest.requiredFeatures.length, 'Feature ids must be unique.')

const featureRequirementMatchers = {
  'visible-pointer-draw': (block) => /toolbar-rectangle/.test(block) && /pointerDrag/.test(block),
  'scene-written-to-disk': (block) => /walkVaultFiles/.test(block) && /sceneFile/.test(block) && /elements/.test(block),
  'png-preview-written-to-disk': (block) => /preview/.test(block) && /bytes/.test(block) && /png/i.test(block),
  'saved-drawing-reopened-from-library': (block) => /data-entry-path/.test(block) && /reopened/.test(block),
  'physical-keyboard-shortcut': (block) => /act\(h, ['"]pressShortcut['"]/.test(block),
  'physical-data-transfer-drop': (block) => /act\(h, ['"]dropFiles['"]/.test(block),
  'byte-identical-disk-copy': (block) => /readFileSync/.test(block) && /drop-marker/.test(block),
  'visible-image-render': (block) => /readDom|dom/.test(block) && /img/.test(block),
  'asset-written-to-disk': (block) => /[.]assets/.test(block) && /existsSync/.test(block),
  'visible-clickable-link': (block) => /readDom|dom/.test(block) && /a`| a['"]| a\)/.test(block),
  'attachment-written-to-disk': (block) => /assetPath/.test(block) && /existsSync/.test(block)
}
for (const [id, requirements] of Object.entries(manifest.featureRequirements || {})) {
  assert(manifest.requiredFeatures.includes(id), `featureRequirements references unknown feature ${id}.`)
  const block = featureBlock(runner, id)
  for (const requirement of requirements) {
    const matcher = featureRequirementMatchers[requirement]
    assert(typeof matcher === 'function', `Unknown feature requirement ${requirement} for ${id}.`)
    if (matcher) assert(matcher(block), `${id} does not satisfy declared requirement ${requirement}.`)
  }
}
errors.push(...runnerContractErrors(runner))

for (const token of ['pressShortcut', 'pasteText', 'dropFiles', 'pointerDrag', 'DataTransfer', 'DragEvent', 'installPdfViewerProbe', 'readFileOpenHistory']) {
  assert(surface.includes(token), `Physical automation surface is missing ${token}.`)
}
assert(main.includes('automationAcceptancePhysicalSurface.js'), 'Main renderer must install the extended acceptance surface.')
assert(workflow.includes('pnpm build:linux'), 'Feature workflow must build the Linux package.')
assert(workflow.includes('ELEPHANT_PACKAGED_FORMAT=linux-appimage'), 'Feature workflow must identify the exact AppImage format.')
assert(workflow.includes('run-packaged-feature-matrix.mjs'), 'Feature workflow must run the independent matrix.')
assert(workflow.includes('sha256sum'), 'Feature workflow must record the exact AppImage SHA-256.')
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
