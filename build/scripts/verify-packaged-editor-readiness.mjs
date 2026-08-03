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

const rustEngineSource = read('Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js')
const rustMirrorSource = read('Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js')
const rustRuntimeEditorSource = read('Elephant/frontend/src/renderer/src/muya/RustMuyaRuntimeEditor.vue')
const rustWrapperSource = read('Elephant/frontend/src/renderer/src/muya/completeMuyaRustAdapter.js.wrapper.js')
const muyaSource = read('Elephant/frontend/src/muya/lib/index.js')
const guardSource = read('Elephant/frontend/src/renderer/src/platform/packagedEditorReadinessGuards.js')
const rendererHtml = read('Elephant/frontend/src/renderer/index.html')
assert.match(rustEngineSource, /import \{ invoke as nativeTauriInvoke \} from '@tauri-apps\/api\/core'/)
assert.match(rustEngineSource, /target\?\.__TAURI_INTERNALS__/)
assert.match(rustEngineSource, /using official Tauri core invoke/)
assert.ok(
  rustEngineSource.indexOf('target?.__TAURI_INTERNALS__') < rustEngineSource.indexOf('target?.tauri?.ipcRenderer'),
  'the Rust editor must select the official Tauri runtime before the legacy compatibility bridge'
)
assert.match(rustMirrorSource, /const initialize = async\(\) =>/)
assert.match(rustMirrorSource, /const state = await client\.create\(markdown\)/)
assert.match(rustMirrorSource, /initializationPromise = Promise\.resolve\(\)/)
assert.match(rustMirrorSource, /await initializationPromise\n {4}if \(draining\)/)
assert.match(rustMirrorSource, /await initializationPromise\n {8}await flush\(\)/)
assert.doesNotMatch(rustMirrorSource, /const ready = reset\(initialMarkdown, 'initial'\)/)
assert.doesNotMatch(rustMirrorSource, /let initialized = false/)
assert.doesNotMatch(rustMirrorSource, /destroyed \|\| !initialized/)
assert.match(rustMirrorSource, /if \(!client\.state\) \{/)
assert.match(rustMirrorSource, /has no canonical state before \$\{reason\}/)
assert.match(rustMirrorSource, /\[elephantnote:muya-rust\] command failed/)
assert.match(rustMirrorSource, /sessionId: client\.sessionId/)
assert.ok(
  rustMirrorSource.indexOf('initializationPromise = Promise.resolve()') < rustMirrorSource.indexOf('const ready = initializationPromise'),
  'the mirror readiness promise must be the explicit native session creation barrier'
)

// Muya intentionally replaces the Vue placeholder with its own connected
// container. The runtime must validate, retain and instrument that live node;
// checking the detached origin container destroys an otherwise ready session.
assert.match(muyaSource, /originContainer\.replaceWith\(container\)/)
assert.match(rustRuntimeEditorSource, /const mountedElement = nextRuntime\?\.domContainer \|\| hostElement/)
assert.match(rustRuntimeEditorSource, /generation !== mountGeneration \|\| !mountedElement\?\.isConnected/)
assert.match(rustRuntimeEditorSource, /rootRef\.value = mountedElement/)
assert.match(rustRuntimeEditorSource, /installUserMutationBoundary\(mountedElement\)/)
assert.doesNotMatch(
  rustRuntimeEditorSource,
  /generation !== mountGeneration \|\| !rootRef\.value\?\.isConnected/,
  'the replaced Vue placeholder must never be used as the post-mount connectivity oracle'
)

// External document replacement destroys the previous Muya instance before
// constructing the next one. Preserve its connected container only inside the
// dedicated runtime shell so the next constructor receives a live origin node.
assert.match(rustWrapperSource, /parent\?\.classList\?\.contains\('muya-rust-runtime-shell'\)/)
assert.match(rustWrapperSource, /const result = super\.destroy\(\)/)
assert.match(rustWrapperSource, /if \(preserveRuntimeHost && !container\.isConnected && parent\)/)
assert.match(rustWrapperSource, /parent\.insertBefore\(container, nextSibling\)/)
assert.ok(
  rustWrapperSource.indexOf('const result = super.destroy()') < rustWrapperSource.indexOf('parent.insertBefore(container, nextSibling)'),
  'the destroyed Muya surface must be restored as a host before the next remount'
)

// The packaged automation boundary must not return from an external Markdown
// replacement while the renderer still exposes the previous or initializing
// Muya surface. Require exact parent Markdown and the canonical Rust oracle.
assert.match(guardSource, /const waitForCanonicalMarkdownReplacement = async\(api, expectedMarkdown\)/)
assert.match(guardSource, /String\(last\?\.markdown \|\| ''\) === expected/)
assert.match(guardSource, /canonicalRustEditorIsReady\(last, activePath\)/)
assert.match(guardSource, /api\.setMarkdown = async\(markdown, \.\.\.args\)/)
assert.match(guardSource, /await waitForCanonicalMarkdownReplacement\(api, markdown\)/)

assert.match(guardSource, /eventName !== 'selectionChange'/)
assert.match(guardSource, /mirror\?\.status\?\.phase !== 'ready'/)
assert.match(guardSource, /packagedNotePathMatches/)
assert.match(guardSource, /canonicalRustEditorIsReady/)
assert.match(rendererHtml, /packagedEditorReadinessGuards\.js/)
assert.doesNotMatch(rendererHtml, /nativeTauriInvokeBootstrap\.js/)

console.log('[packaged-editor-readiness] canonical state oracle, native session barrier, Muya replacement/remount lifecycle, setMarkdown readiness, invoke selection and path guards passed')
