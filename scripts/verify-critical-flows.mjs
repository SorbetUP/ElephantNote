import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const failures = []

const assertFile = (relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing required critical-flow file: ${relativePath}`)
  }
}

const assertIncludes = (relativePath, needle, description) => {
  const content = read(relativePath)
  if (!content.includes(needle)) {
    failures.push(`${relativePath}: missing ${description || needle}`)
  }
}

const assertOrdered = (relativePath, needles, description) => {
  const content = read(relativePath)
  let cursor = -1
  for (const needle of needles) {
    const next = content.indexOf(needle, cursor + 1)
    if (next === -1) {
      failures.push(`${relativePath}: missing ordered invariant "${needle}" for ${description}`)
      return
    }
    cursor = next
  }
}

for (const requiredFile of [
  'test/unit/specs/main/elephantnote/markdown.spec.js',
  'test/unit/specs/main/elephantnote/markdownDocument.spec.js',
  'scripts/verify-critical-flows.mjs'
]) {
  assertFile(requiredFile)
}

assertIncludes('.github/workflows/ci.yml', 'node scripts/verify-critical-flows.mjs', 'critical-flow guard in CI')
assertIncludes('.github/workflows/ci.yml', 'pnpm exec vitest run test/unit/specs/main/elephantnote', 'dedicated ElephantNote contract tests in CI')

assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const getActiveNoteFile = () => {',
    'if (currentFile.value?.pathname && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname))',
    'editorStore.tabs.find'
  ],
  'active opened note must prefer currentFile before tab lookup so the editor does not render empty markdown during IPC/tab handoff'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const updateCurrentFileMarkdown = (nextMarkdown, metadata = {}) => {',
    'store.updateNoteMetadata(notePath, metadata)',
    'searchStore.updateNoteIndex(notePath, nextMarkdown, metadata)'
  ],
  'editor edits must synchronise visible list metadata and local search index'
)
assertOrdered(
  'Elephant/front/app/components/editor/NoteEditorHost.vue',
  [
    'const updateTitle = (nextTitle) => {',
    'renameDocumentTitle(markdown.value, title, fallbackTitle.value)',
    '{ title }'
  ],
  'title edits must update frontmatter/heading and visible metadata together'
)

assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'const normalizeRelativePath = (relativePath = \'\')',
    '.replace(/\\\\/g, \'/\')',
    'const getDocumentPath = (document) => normalizeRelativePath'
  ],
  'search paths must be normalised before indexing/opening results'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'async hydrateLocalFallback() {',
    'await this.inspect()'
  ],
  'search fallback must hydrate local inspection before returning no results'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    'const backendResults = Array.isArray(results)',
    'if (backendResults.length)',
    'await this.hydrateLocalFallback()',
    'this.results = this.localSearch(query, this.queryLimit)'
  ],
  'empty backend search results must fall back to local inspected documents'
)
assertOrdered(
  'Elephant/front/app/stores/searchStore.js',
  [
    '} catch (error) {',
    'await this.hydrateLocalFallback()',
    'const fallbackResults = this.localSearch(query, this.queryLimit)'
  ],
  'backend search failures must still try local fallback'
)

assertOrdered(
  'Elephant/front/app/stores/vaultStore.js',
  [
    'async moveEntry(entry, targetDirectoryPath = \'\') {',
    'elephantnoteClient.entries.move',
    'this.pinnedNotePaths = this.pinnedNotePaths.map',
    'this.openedNotePath = replacePathPrefix',
    'this.entries = await elephantnoteClient.directory.list(this.currentPath)',
    'this.rootEntries = await elephantnoteClient.directory.list(\'\')'
  ],
  'moving entries must refresh visible directory state and update opened/pinned paths'
)

if (failures.length) {
  console.error('Critical ElephantNote flow guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Critical ElephantNote flow guard passed.')
