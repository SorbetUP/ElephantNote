#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canonicalRustEditorIsReady,
  normalizePackagedNotePath,
  packagedNotePathMatches
} from '../../Elephant/frontend/src/renderer/src/platform/packagedEditorReadinessContracts.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

assert.equal(normalizePackagedNotePath('C:\\vault\\Getting Started\\Welcome.md'), 'C:/vault/Getting Started/Welcome.md')
assert.equal(packagedNotePathMatches('/tmp/vault/Getting Started/Welcome.md', 'Getting Started/Welcome.md'), true)
assert.equal(packagedNotePathMatches('C:\\vault\\Getting Started\\Welcome.md', 'Getting Started/Welcome.md'), true)
assert.equal(packagedNotePathMatches('/tmp/vault/Getting Started/Welcome.md.bak', 'Getting Started/Welcome.md'), false)

const ready = {
  activeFile: { path: 'C:\\vault\\Getting Started\\Welcome.md' },
  editorRuntime: {
    active: true,
    contentEditable: 'true',
    contentEditableConnected: true
  },
  rustMirror: {
    active: true,
    phase: 'ready',
    renderedMatchesCanonical: true,
    error: null,
    pending: 0
  }
}
assert.equal(canonicalRustEditorIsReady(ready, 'Getting Started/Welcome.md'), true)
assert.equal(canonicalRustEditorIsReady({ ...ready, rustMirror: { ...ready.rustMirror, phase: 'initializing' } }, 'Getting Started/Welcome.md'), false)
assert.equal(canonicalRustEditorIsReady({ ...ready, rustMirror: { ...ready.rustMirror, pending: 1 } }, 'Getting Started/Welcome.md'), false)

const guardSource = read('Elephant/frontend/src/renderer/src/platform/packagedEditorReadinessGuards.js')
const rendererHtml = read('Elephant/frontend/src/renderer/index.html')
assert.match(guardSource, /eventName !== 'selectionChange'/)
assert.match(guardSource, /mirror\?\.status\?\.phase !== 'ready'/)
assert.match(guardSource, /packagedNotePathMatches/)
assert.match(guardSource, /canonicalRustEditorIsReady/)
assert.match(rendererHtml, /packagedEditorReadinessGuards\.js/)

console.log('[packaged-editor-readiness] path normalization and Rust initialization guards passed')
