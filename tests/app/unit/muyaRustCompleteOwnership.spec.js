import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const adapterPath = 'Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js'
const sessionPath = 'Elephant/backend/tauri/src/markdown/muya_session.rs'
const completePath = 'Elephant/backend/tauri/src/markdown/muya_complete.rs'

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
  'replace'
]

const requiredContentStateHooks = [
  'updateParagraph',
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
  'insertParagraph'
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
  })

  it('routes every public document mutation through the strict Rust adapter', () => {
    const adapter = read(adapterPath)
    for (const method of requiredPublicMutations) {
      expect(adapter).toMatch(new RegExp(`\\n  ${method.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')} \\(`))
    }
    expect(adapter).toContain('__applyRust (name, operation)')
    expect(adapter).toContain('JavaScript Muya fallback is disabled')
  })

  it('intercepts every ContentState mutation entry point used by keyboard and toolbars', () => {
    const adapter = read(adapterPath)
    for (const method of requiredContentStateHooks) {
      expect(adapter).toContain(`this.contentState.${method} =`)
    }
  })

  it('registers the complete typed command in the native session', () => {
    const session = read(sessionPath)
    const complete = read(completePath)
    expect(session).toContain('tauri_muya_session_apply_complete')
    expect(session).toContain('apply_complete_command(state, command)')
    expect(complete).toContain('pub enum MuyaCompleteCommand')
    expect(complete).toContain('DuplicateBlock')
    expect(complete).toContain('DeleteBlock')
    expect(complete).toContain('MoveBlock')
    expect(complete).toContain('SearchReplace')
  })
})
