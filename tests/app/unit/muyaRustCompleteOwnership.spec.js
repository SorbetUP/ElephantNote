import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const adapterPath = 'Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js'
const sessionPath = 'Elephant/backend/tauri/src/markdown/muya_session.rs'
const completePath = 'Elephant/backend/tauri/src/markdown/muya_complete.rs'
const surfacePath = 'Elephant/backend/tauri/src/markdown/muya_surface.rs'
const assetsPath = 'Elephant/backend/tauri/src/markdown/muya_assets.rs'
const tauriEntryPath = 'Elephant/backend/tauri/src/lib_min.rs'
const vitePath = 'vite.tauri.config.mjs'

const requiredPublicMutations = [
  'undo',
  'redo',
  'format',
  'updateParagraph',
  'duplicate',
  'deleteParagraph',
  'insertParagraph',
  'editTable',
  'createTable',
  'insertImage',
  'selectAll',
  'replace',
  'pasteAsPlainText',
  'replaceWordInline'
]

const requiredContentStateHooks = [
  'updateParagraph',
  'format',
  'clearBlockFormat',
  'editTable',
  'updateImage',
  'deleteImage',
  'createFootnote',
  'pasteHandler',
  'enterHandler',
  'tabHandler',
  'backspaceHandler',
  'docBackspaceHandler',
  'deleteHandler',
  'inputHandler',
  'duplicate',
  'deleteParagraph',
  'insertParagraph',
  'updateCodeLanguage',
  'unlink',
  'listItemCheckBoxClick'
]

describe('complete Rust ownership of Muya document mutations', () => {
  it('contains no JavaScript mutation fallback', () => {
    const adapter = read(adapterPath)
    expect(adapter).not.toContain('__elephantRustOriginalContentState')
    expect(adapter).not.toMatch(/\bfallback\s*[(:=]/)
    expect(adapter).not.toContain('using Muya command')
    expect(adapter).not.toContain('return super.undo()')
    expect(adapter).not.toContain('return super.redo()')
    expect(adapter).not.toContain('return super.format(')
    expect(adapter).not.toContain('return super.updateParagraph(')
    expect(adapter).not.toContain('return super.editTable(')
    expect(adapter).not.toContain('return super.insertImage(')
    expect(adapter).not.toContain('innerHTML =')
  })

  it('routes every public document mutation through the strict Rust adapter', () => {
    const adapter = read(adapterPath)
    for (const method of requiredPublicMutations) {
      expect(adapter).toMatch(new RegExp(`\\n  (?:async )?${method} \\(`))
    }
    expect(adapter).toContain('__applyRust (name, operation)')
    expect(adapter).toContain('JavaScript fallback is disabled')
    expect(adapter).toContain('rejected non-canonical JavaScript mutation')
  })

  it('intercepts every ContentState mutation entry point used by keyboard and toolbars', () => {
    const adapter = read(adapterPath)
    for (const method of requiredContentStateHooks) {
      expect(adapter).toMatch(new RegExp(`hooks\\.${method}\\s*=`))
    }
  })

  it('owns complete and advanced mutations in typed Rust enums', () => {
    const session = read(sessionPath)
    const complete = read(completePath)
    const surface = read(surfacePath)
    expect(session).toContain('tauri_muya_session_apply_complete')
    expect(session).toContain('MuyaSessionMutation::Complete')
    expect(session).toContain('MuyaSessionMutation::Surface')
    expect(complete).toContain('pub enum MuyaCompleteCommand')
    expect(complete).toContain('DuplicateBlock')
    expect(complete).toContain('DeleteBlock')
    expect(complete).toContain('MoveBlock')
    expect(complete).toContain('SearchReplace')
    expect(surface).toContain('pub enum MuyaSurfaceCommand')
    expect(surface).toContain('FormatInline')
    expect(surface).toContain('TransformTable')
    expect(surface).toContain('InsertImage')
    expect(surface).toContain('UpdateImage')
  })

  it('persists binary images through Rust inside the hidden assets folder', () => {
    const adapter = read(adapterPath)
    const assets = read(assetsPath)
    const entry = read(tauriEntryPath)
    expect(adapter).toContain("invoke('tauri_muya_asset_write'")
    expect(assets).toContain('vault_layout::assets_dir(vault_root)')
    expect(assets).toContain('MAX_ASSET_BYTES')
    expect(entry).toContain('markdown::muya_assets::tauri_muya_asset_write')
  })

  it('loads the strict adapter only for the exact Muya class import', () => {
    const vite = read(vitePath)
    expect(vite).toContain("if (source !== 'muya/lib') return null")
    expect(vite).toContain('realMuyaRustAdapter.js')
    expect(vite).not.toContain("source.startsWith('muya/lib')")
  })
})
