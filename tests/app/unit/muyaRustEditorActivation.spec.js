import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDirectory, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

describe('canonical Rust note editor activation', () => {
  it('routes open notes through the dedicated Rust host', () => {
    const mainContent = read('Elephant/frontend/app/components/shell/MainContent.vue')
    expect(mainContent).toContain("import RustNoteEditorHost from '../editor/RustNoteEditorHost.vue'")
    expect(mainContent).toContain('<rust-note-editor-host')
    expect(mainContent).not.toContain("import NoteEditorHost from '../editor/NoteEditorHost.vue'")
  })

  it('mounts active Rust mode inside the real editor host and hides legacy input', () => {
    const host = read('Elephant/frontend/app/components/editor/RustNoteEditorHost.vue')
    expect(host).toContain('mode="active"')
    expect(host).toContain(':data-editor-engine="rustEditorActive ? \'rust\' : \'legacy-muya\'"')
    expect(host).toContain("window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'rust'")
    expect(host).toContain('.en-editor-host > :not(.en-rust-note-editor)')
    expect(host).toContain("throw new Error('Rust note editor mounted without the canonical Rust engine.')")
  })

  it('forbids silent JavaScript fallback while active mode is requested', () => {
    const runtimeHook = read('Elephant/frontend/src/renderer/src/muya/useMuyaRuntimeEditor.js')
    expect(runtimeHook).toContain('Active Muya mode requires the Rust Tauri engine')
    expect(runtimeHook).toContain('rootRef.value.dataset.muyaEngine = engineKind')
  })
})
