#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canonicalRustEditorIsReady,
  normalizePackagedNotePath,
  packagedNotePathMatches,
  resolveCanonicalTauriInvoke
} from '../../Elephant/frontend/src/renderer/src/platform/packagedEditorReadinessContracts.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

assert.equal(normalizePackagedNotePath('C:\\vault\\Getting Started\\Welcome.md'), 'C:/vault/Getting Started/Welcome.md')
assert.equal(packagedNotePathMatches('/tmp/vault/Getting Started/Welcome.md', 'Getting Started/Welcome.md'), true)
assert.equal(packagedNotePathMatches('C:\\vault\\Getting Started\\Welcome.md', 'Getting Started/Welcome.md'), true)
assert.equal(packagedNotePathMatches('/tmp/vault/Getting Started/Welcome.md.bak', 'Getting Started/Welcome.md'), false)

const invokeCalls = []
const invokeTarget = {
  __TAURI__: {
    core: {
      invoke(command, payload) {
        invokeCalls.push(['native', command, payload])
        return 'native-result'
      }
    }
  },
  tauri: {
    ipcRenderer: {
      invoke(command, payload) {
        invokeCalls.push(['legacy', command, payload])
        return 'legacy-result'
      }
    }
  }
}
const nativeInvoke = resolveCanonicalTauriInvoke(invokeTarget)
assert.equal(nativeInvoke.kind, 'native')
assert.equal(nativeInvoke.invoke('tauri_muya_session_create', { editorId: 'editor-1' }), 'native-result')
assert.deepEqual(invokeCalls, [['native', 'tauri_muya_session_create', { editorId: 'editor-1' }]])

const legacyInvoke = resolveCanonicalTauriInvoke({ tauri: invokeTarget.tauri })
assert.equal(legacyInvoke.kind, 'legacy')
assert.equal(legacyInvoke.invoke('legacy-command', {}), 'legacy-result')
assert.equal(resolveCanonicalTauriInvoke({}).kind, 'unavailable')

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
assert.match(guardSource, /installNativeTauriInvokeBridge/)
assert.match(guardSource, /resolveCanonicalTauriInvoke/)
assert.match(guardSource, /packagedNotePathMatches/)
assert.match(guardSource, /canonicalRustEditorIsReady/)
assert.match(rendererHtml, /packagedEditorReadinessGuards\.js/)

console.log('[packaged-editor-readiness] native invoke, path normalization and Rust initialization guards passed')
