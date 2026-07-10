import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDirectory, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(repositoryRoot, relativePath))

describe('real Muya editor activation', () => {
  it('keeps open notes routed through the real Muya EditorWithTabs component', () => {
    const mainContent = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const viteConfig = read('vite.tauri.config.js')

    expect(mainContent).toContain("import NoteEditorHost from '../editor/NoteEditorHost.vue'")
    expect(mainContent).toContain('<note-editor-host')
    expect(mainContent).not.toContain('RustNoteEditorHost')
    expect(viteConfig).not.toContain('rustEditorWithTabsPlugin')
    expect(viteConfig).not.toContain('RustEditorWithTabs.vue')
    expect(exists('Elephant/frontend/app/components/editor/RustEditorWithTabs.vue')).toBe(false)
    expect(exists('Elephant/frontend/app/components/editor/RustNoteEditorHost.vue')).toBe(false)
  })

  it('preserves the official Muya DOM surface instead of a raw Markdown renderer', () => {
    const editorWithTabs = read('Elephant/frontend/src/renderer/src/components/editorWithTabs/index.vue')
    const editor = read('Elephant/frontend/src/renderer/src/components/editorWithTabs/editor.vue')

    expect(editorWithTabs).toContain("import Editor from './editor.vue'")
    expect(editorWithTabs).toContain('<editor')
    expect(editor).toContain("import Muya from 'muya/lib'")
    expect(editor).toContain("import 'muya/themes/default.css'")
    expect(editor).toContain('editor.value = new Muya(ele, options)')
    expect(editor).toContain('class="editor-component"')
    expect(editor).not.toContain('MuyaRuntimeEditor')
  })

  it('injects Rust behind only the exact Muya class import', () => {
    const viteConfig = read('vite.tauri.config.js')
    const adapter = read('Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js')
    const mirror = read('Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js')
    const client = read('Elephant/frontend/src/renderer/src/muya/rustEngineRuntime.js')

    expect(viteConfig).toContain('const realMuyaRustMirrorPlugin = () => ({')
    expect(viteConfig).toContain("if (source !== 'muya/lib') return null")
    expect(viteConfig).toContain('realMuyaRustAdapter.js')
    expect(viteConfig).toContain('realMuyaRustMirrorPlugin()')
    expect(viteConfig).not.toContain("'muya/lib': resolve(")
    expect(adapter).toContain("import Muya from '../../../muya/lib'")
    expect(adapter).toContain('export default class RealMuyaWithRustMirror extends Muya')
    expect(adapter).toContain("this.on('change', this.__elephantRustChangeListener)")
    expect(adapter).not.toContain('innerHTML')
    expect(adapter).not.toContain('createElement')
    expect(mirror).toContain("target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'muya-ui-rust-core'")
    expect(mirror).toContain('client.syncDocument(')
    expect(mirror).toContain('client.jsonState()')
    expect(client).toContain("'tauri_muya_engine_sync_document'")
  })

  it('keeps every Muya UI plugin on the untouched original submodule path', () => {
    const editor = read('Elephant/frontend/src/renderer/src/components/editorWithTabs/editor.vue')
    const viteConfig = read('vite.tauri.config.js')

    for (const moduleName of [
      'tablePicker',
      'quickInsert',
      'codePicker',
      'emojiPicker',
      'imagePicker',
      'imageSelector',
      'imageToolbar',
      'transformer',
      'formatPicker',
      'linkTools',
      'footnoteTool',
      'tableTools',
      'frontMenu'
    ]) {
      expect(editor).toContain(`muya/lib/ui/${moduleName}`)
    }
    expect(viteConfig).toContain("if (source !== 'muya/lib') return null")
  })

  it('keeps the experimental Rust renderer opt-in instead of replacing production Muya', () => {
    const flags = read('Elephant/frontend/src/renderer/src/muya/runtimeFlags.js')
    const runtimeHook = read('Elephant/frontend/src/renderer/src/muya/useMuyaRuntimeEditor.js')

    expect(flags).toContain('export const defaultMuyaRuntimeMode = () => MUYA_RUNTIME_FLAGS.disabled')
    expect(runtimeHook).toContain('allowJavaScriptFallback = false')
    expect(runtimeHook).toContain("rootRef.value.dataset.muyaEngine = 'unavailable'")
    expect(runtimeHook).toContain('active mode unavailable: Rust Tauri engine is required')
  })
})
