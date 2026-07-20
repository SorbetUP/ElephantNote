#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const testsRoot = join(root, 'tests')
const reportRoot = join(root, 'test-results', 'trust')
const failures = []
const inventory = {
  scannedFiles: 0,
  testFiles: 0,
  directTestDeclarations: 0,
  sourceTextContractFiles: [],
  mockedFiles: [],
  jsdomFiles: [],
  dynamicallyGeneratedFiles: [],
  forbiddenFilesPresent: []
}

const normalized = (path) => relative(root, path).replaceAll('\\', '/')
const isTestFile = (path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)
const read = (path) => readFileSync(path, 'utf8')

const walk = (directory) => {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const forbiddenPaths = [
  'tests/app/unit/interfaceEditorSurfaceGenerated.spec.js',
  'tests/app/unit/interfaceParityGenerated.spec.js',
  'tests/app/unit/pageFeatureCardsAndModelsGenerated.spec.js',
  'tests/app/unit/editorInputAndClipboardGenerated.spec.js',
  'tests/app/e2e/playwright.config.js',
  'tests/app/e2e/helpers.js',
  'tests/app/e2e/electron-main.js',
  'tests/app/e2e/tauri-preload-entry.js',
  'tests/app/e2e/linux-usage-regressions.spec.js',
  'tests/app/e2e/official-addons-regressions.spec.js'
]

for (const relativePath of forbiddenPaths) {
  if (existsSync(join(root, relativePath))) {
    inventory.forbiddenFilesPresent.push(relativePath)
    failures.push(`${relativePath}: forbidden fake/legacy application test path is present`)
  }
}

const testFiles = walk(testsRoot).filter(isTestFile)
inventory.testFiles = testFiles.length
inventory.scannedFiles = walk(testsRoot).length

for (const path of testFiles) {
  const file = normalized(path)
  const name = basename(path)
  const source = read(path)
  const directTests = [...source.matchAll(/\b(?:it|test)\s*\(/g)].length
  inventory.directTestDeclarations += directTests

  if (/generated|paritygenerated/i.test(name)) {
    failures.push(`${file}: generated test filenames are forbidden`)
  }
  if (/\bdescribe\s*\(\s*['"`]generated\b/i.test(source) || /\b(?:it|test)\s*\(\s*[`'"]generated\b/i.test(source)) {
    failures.push(`${file}: generated test titles are forbidden`)
  }

  const countedLoop = [...source.matchAll(/for\s*\([^)]*<\s*(\d{2,})[^)]*\)\s*\{[\s\S]{0,2500}?\b(?:it|test)\s*\(/g)]
    .map((match) => Number(match[1]))
    .filter((count) => count >= 20)
  const generatedArray = [...source.matchAll(/Array\.from\s*\(\s*\{\s*length\s*:\s*(\d{2,})/g)]
    .map((match) => Number(match[1]))
    .filter((count) => count >= 20)
  const callbackTests = /(?:forEach|map)\s*\([^)]*=>\s*\{?[\s\S]{0,1200}?\b(?:it|test)\s*\(/.test(source)
  const dynamic = countedLoop.length > 0 || (generatedArray.length > 0 && /for\s*\([^)]*\bof\b[^)]*\)[\s\S]{0,2500}?\b(?:it|test)\s*\(/.test(source)) || callbackTests
  if (dynamic) {
    inventory.dynamicallyGeneratedFiles.push({ file, countedLoop, generatedArray, callbackTests })
    failures.push(`${file}: dynamically generated test cases are forbidden; exercise representative inputs inside one named behavior test`)
  }
  if (directTests > 100) {
    failures.push(`${file}: ${directTests} direct test declarations is test-count inflation; split by real behavior or reduce duplication`)
  }

  const sourceTextOnly = /readFileSync|\bread\s*\([^)]*\.(?:vue|js|ts|rs|yml|yaml|json)['"`]/.test(source) && /toContain|includes\s*\(/.test(source)
  if (sourceTextOnly) inventory.sourceTextContractFiles.push(file)
  if (/\bvi\.mock\s*\(|\bjest\.mock\s*\(|mockImplementation\s*\(/.test(source)) inventory.mockedFiles.push(file)
  if (/\bjsdom\b|document\.createElement|globalThis\.document/.test(source)) inventory.jsdomFiles.push(file)

  if (file.startsWith('tests/trusted/')) {
    if (sourceTextOnly) failures.push(`${file}: trusted tests may not prove behavior by reading source text`)
    if (/\bvi\.mock\s*\(|\bjest\.mock\s*\(/.test(source)) failures.push(`${file}: trusted tests may not mock the subsystem being claimed`)
    if (/function\s+(?:toolbarState|statusText|panelVisibility|editorModeLabel)\b/.test(source)) failures.push(`${file}: trusted tests may not recreate fake product behavior locally`)
  }
}

const packagePath = join(root, 'package.json')
const packageJson = JSON.parse(read(packagePath))
const scripts = packageJson.scripts || {}
const requiredScripts = {
  'test:trust:guard': 'verify-test-trust.mjs',
  'test:markdown:trusted:raw': 'run-markdown-editor-trust.mjs',
  'test:legacy:raw': 'vitest run',
  test: 'test:trust:guard'
}
for (const [name, marker] of Object.entries(requiredScripts)) {
  if (!String(scripts[name] || '').includes(marker)) failures.push(`package.json: script ${name} must contain ${marker}`)
}
if (!String(scripts.test || '').includes('test:markdown:trusted')) {
  failures.push('package.json: default test command must run the real Markdown editor trust suite')
}
if (String(scripts.test || '').includes('vitest')) {
  failures.push('package.json: default test command may not use the legacy Vitest count as product proof')
}

const manifestPath = join(root, 'tests', 'trust', 'required-scenarios.json')
const runnerPath = join(root, 'build', 'scripts', 'run-markdown-editor-trust.mjs')
if (!existsSync(manifestPath)) failures.push('tests/trust/required-scenarios.json: missing')
if (!existsSync(runnerPath)) failures.push('build/scripts/run-markdown-editor-trust.mjs: missing')
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

const e2eWorkflow = read(join(root, '.github', 'workflows', 'e2e.yml'))
if (!e2eWorkflow.includes('pnpm test:trust:guard')) failures.push('.github/workflows/e2e.yml: must run the test-trust guard')
if (!e2eWorkflow.includes('pnpm test:markdown:trusted:raw')) failures.push('.github/workflows/e2e.yml: must run the packaged Markdown trust suite')

const testWorkflow = read(join(root, '.github', 'workflows', 'test.yml'))
if (!testWorkflow.includes('pnpm test:trust:guard')) failures.push('.github/workflows/test.yml: must run the test-trust guard')
if (testWorkflow.includes('pnpm test:legacy') || testWorkflow.includes('pnpm test 2>&1 | tee vitest-output')) {
  failures.push('.github/workflows/test.yml: legacy Vitest diagnostics may not be the product test gate')
}

const agents = read(join(root, 'AGENTS.md'))
for (const marker of [
  'Legacy diagnostics are not product proof.',
  'Generated test cases are forbidden.',
  'Markdown editor changes require the real Tauri editor trust scenarios.'
]) {
  if (!agents.includes(marker)) failures.push(`AGENTS.md: missing mandatory test-trust rule ${JSON.stringify(marker)}`)
}

mkdirSync(reportRoot, { recursive: true })
const report = {
  at: new Date().toISOString(),
  status: failures.length === 0 ? 'PROVEN' : 'FAILED',
  note: 'Legacy test counts are diagnostics only and are not product proof.',
  inventory,
  failures
}
writeFileSync(join(reportRoot, 'test-inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`[test-trust] files=${inventory.testFiles} direct-declarations=${inventory.directTestDeclarations}`)
console.log(`[test-trust] legacy-source-text-contracts=${inventory.sourceTextContractFiles.length}`)
console.log(`[test-trust] mocked-files=${inventory.mockedFiles.length} jsdom-files=${inventory.jsdomFiles.length}`)
console.log(`[test-trust] report=${normalized(join(reportRoot, 'test-inventory.json'))}`)

if (failures.length > 0) {
  console.error('[test-trust] FAILED')
  for (const failure of failures) console.error(`[test-trust] ${failure}`)
  process.exit(1)
}

console.log('[test-trust] OK: the default product gate is real application behavior, not a generated Vitest count')
