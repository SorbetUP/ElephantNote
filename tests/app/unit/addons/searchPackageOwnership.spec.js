import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Search physical package ownership', () => {
  it('indexes notes through permission-scoped addon commands', () => {
    const manifest = JSON.parse(read('addons/official/ai-search/manifest.json'))
    const source = read('addons/official/ai-search/main.js')

    expect(manifest.version).toBe('1.2.0')
    expect(manifest.permissions.notes.read).toEqual(['*'])
    expect(source).toContain("tauri_addons_notes_list")
    expect(source).toContain("tauri_addons_notes_read")
    expect(source).toContain("api.resources.provide(PROVIDER_RESOURCE")
    expect(source).toContain("engine: 'package-owned-bm25'")
    expect(source).toContain('query: (text, options) => this.query(text, options)')
    expect(source).toContain('rebuild: () => this.rebuild()')
    expect(source).toContain('clear: () => this.clear()')
    expect(source).toContain('status: () => this.status()')
  })

  it('does not call the legacy global Search actions', () => {
    const source = read('addons/official/ai-search/main.js')
    for (const action of ['search.status', 'search.rebuild', 'search.clear', 'search.enable', 'search.disable']) {
      expect(source).not.toContain(action)
    }
    expect(source).not.toContain('elephantnote.api')
  })

  it('keeps the parallel inspection index physically absent from the core shell', () => {
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const extras = read('Elephant/backend/tauri/src/tauri_extra_commands.rs')
    const compatibility = read('Elephant/frontend/app/services/elephantnoteClient/compatibilityCalls.js')

    expect(core).not.toContain('tauri_extra_commands::tauri_search_inspect')
    expect(core).not.toContain('tauri_extra_commands::tauri_search_rebuild')
    expect(extras).not.toContain('pub fn tauri_search_inspect')
    expect(extras).not.toContain('pub fn tauri_search_rebuild')
    expect(extras).not.toContain('fn build_search_index')
    expect(extras).not.toContain('fn scan_markdown_notes')
    expect(extras).not.toContain('fn extract_wikilinks')
    expect(extras).not.toContain('SEARCH_INDEX_FILE')
    expect(compatibility).toContain("'search.inspect': () => getBridge()?.search?.inspect?.()")
    expect(compatibility).toContain("'search.rebuild': () => getBridge()?.search?.rebuild?.()")
  })

  it('keeps generic note access bounded and permission checked', () => {
    const rust = read('Elephant/backend/tauri/src/addon_note_access.rs')
    expect(rust).toContain('MAX_NOTE_BYTES')
    expect(rust).toContain('read_enabled_addon')
    expect(rust).toContain('Addon is not permitted to read')
    expect(rust).toContain('Addons cannot read notes from hidden directories')
  })
})
