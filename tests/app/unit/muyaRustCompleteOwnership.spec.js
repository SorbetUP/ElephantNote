import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const baseAdapterPath = 'Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js'
const completeAdapterPath = 'Elephant/frontend/src/renderer/src/muya/completeMuyaRustAdapter.js'
const mirrorPath = 'Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js'
const sessionPath = 'Elephant/backend/tauri/src/markdown/muya_session.rs'
const completePath = 'Elephant/backend/tauri/src/markdown/muya_complete.rs'
const surfacePath = 'Elephant/backend/tauri/src/markdown/muya_surface.rs'
const advancedPath = 'Elephant/backend/tauri/src/markdown/muya_advanced.rs'
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

const requiredBaseHooks = [
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

const requiredDirectHooks = [
  'docEnterHandler',
  'docDeleteHandler',
  'selectLanguage',
  'updateCodeLanguage',
  'codeBlockUpdate',
  'switchTableData',
  'deleteSelectedTableCells',
  'replaceWordInline',
  '_replaceCurrentWordInlineUnsafe',
  'selectAll',
  'selectAllContent',
  'createTable',
  'replaceImage',
  'setEmoji'
]

describe('complete Rust ownership of Muya document mutations', () => {
  it('contains no JavaScript mutation fallback', () => {
    const adapters = `${read(baseAdapterPath)}\n${read(completeAdapterPath)}`
    expect(adapters).not.toContain('__elephantRustOriginalContentState')
    expect(adapters).not.toMatch(/\bfallback\s*[(:=]/)
    expect(adapters).not.toContain('using Muya command')
    expect(adapters).not.toContain('return super.undo()')
    expect(adapters).not.toContain('return super.redo()')
    expect(adapters).not.toContain('return super.format(')
    expect(adapters).not.toContain('return super.editTable(')
    expect(adapters).not.toContain('return super.insertImage(')
    expect(adapters).not.toContain('innerHTML =')
  })

  it('routes every public document mutation through the strict Rust adapters', () => {
    const adapters = `${read(baseAdapterPath)}\n${read(completeAdapterPath)}`
    for (const method of requiredPublicMutations) {
      expect(adapters).toMatch(new RegExp(`\\n  (?:async )?${method} \\(`))
    }
    expect(adapters).toContain('__applyRust (name, operation)')
    expect(adapters).toContain('JavaScript fallback is disabled')
    expect(adapters).toContain('rejected non-canonical JavaScript mutation')
  })

  it('intercepts public and direct ContentState mutation entry points', () => {
    const base = read(baseAdapterPath)
    const complete = read(completeAdapterPath)
    for (const method of requiredBaseHooks) {
      expect(base).toMatch(new RegExp(`hooks\\.${method}\\s*=`))
    }
    for (const method of requiredDirectHooks) {
      expect(complete).toMatch(new RegExp(`hooks\\.${method}\\s*=`))
    }
  })

  it('owns complete, surface and interactive mutations in typed Rust enums', () => {
    const session = read(sessionPath)
    const complete = read(completePath)
    const surface = read(surfacePath)
    const advanced = read(advancedPath)
    expect(session).toContain('MuyaSessionMutation::Complete')
    expect(session).toContain('MuyaSessionMutation::Surface')
    expect(session).toContain('MuyaSessionMutation::Advanced')
    expect(complete).toContain('pub enum MuyaCompleteCommand')
    expect(complete).toContain('MoveBlock')
    expect(complete).toContain('SearchReplace')
    expect(surface).toContain('pub enum MuyaSurfaceCommand')
    expect(surface).toContain('TransformTable')
    expect(surface).toContain('UpdateImage')
    expect(advanced).toContain('pub enum MuyaAdvancedCommand')
    expect(advanced).toContain('SmartInput')
    expect(advanced).toContain('SmartEnter')
    expect(advanced).toContain('ReorderTable')
    expect(advanced).toContain('ClearTableCells')
  })

  it('persists binary images through Rust inside the hidden assets folder', () => {
    const adapter = read(baseAdapterPath)
    const assets = read(assetsPath)
    const entry = read(tauriEntryPath)
    expect(adapter).toContain("invoke('tauri_muya_asset_write'")
    expect(assets).toContain('vault_layout::assets_dir(vault_root)')
    expect(assets).toContain('MAX_ASSET_BYTES')
    expect(entry).toContain('markdown::muya_assets::tauri_muya_asset_write')
  })

  it('aliases only the exact Muya class import to the complete Rust adapter', () => {
    const vite = read(vitePath)
    expect(vite).toContain('{ find: /^muya\\/lib$/, replacement: completeMuyaRustAdapter }')
    expect(vite).toContain('completeMuyaRustAdapter.js')
    expect(vite).toContain("{ find: 'muya', replacement:")
    expect(vite).not.toContain("source.startsWith('muya/lib')")
    expect(vite).not.toContain('rustOwnedMuyaPlugin')
  })

  it('publishes an unambiguous runtime proof that the Rust session is active', () => {
    const mirror = read(mirrorPath)
    expect(mirror).toContain("target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'muya-ui-rust-core'")
    expect(mirror).toContain('[elephantnote:editor] real Muya UI with Rust-owned core active')
    expect(mirror).toContain("engine: 'rust'")
    expect(mirror).toContain("surface: 'muya'")
  })
})
