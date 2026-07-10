import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDirectory, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

describe('canonical Rust note editor activation', () => {
  it('keeps the real note host and replaces only its EditorWithTabs injection in Tauri', () => {
    const mainContent = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const viteConfig = read('vite.tauri.config.js')

    expect(mainContent).toContain("import NoteEditorHost from '../editor/NoteEditorHost.vue'")
    expect(mainContent).toContain('<note-editor-host')
    expect(mainContent).not.toContain('RustNoteEditorHost')
    expect(viteConfig).toContain("if (source !== '@/components/editorWithTabs') return null")
    expect(viteConfig).toContain('RustEditorWithTabs.vue')
    expect(viteConfig).toContain('rustEditorWithTabsPlugin()')
  })

  it('mounts exactly one Rust surface and uses legacy Muya only as an explicit fallback', () => {
    const host = read('Elephant/frontend/app/components/editor/RustEditorWithTabs.vue')

    expect(host).toContain('v-if="rustActive"')
    expect(host).toContain('v-else')
    expect(host).toContain('mode="active"')
    expect(host).toContain("window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'rust'")
    expect(host).toContain("throw new Error('Rust Muya editor mounted without the canonical Rust engine.')")
    expect(host).not.toContain('Teleport')
    expect(host).not.toContain('display: none !important')
  })

  it('forbids silent JavaScript fallback while active mode is requested', () => {
    const runtimeHook = read('Elephant/frontend/src/renderer/src/muya/useMuyaRuntimeEditor.js')
    expect(runtimeHook).toContain('allowJavaScriptFallback = false')
    expect(runtimeHook).toContain("rootRef.value.dataset.muyaEngine = 'unavailable'")
    expect(runtimeHook).toContain('active mode unavailable: Rust Tauri engine is required')
    expect(runtimeHook).toContain('rootRef.value.dataset.muyaEngine = engineKind')
  })

  it('keeps JavaScript fallback explicit and test-only', () => {
    const component = read('Elephant/frontend/src/renderer/src/muya/MuyaRuntimeEditor.vue')
    expect(component).toContain('allowJavascriptFallback: { type: Boolean, default: false }')
    expect(component).toContain('allowJavaScriptFallback: props.allowJavascriptFallback')
  })
})
