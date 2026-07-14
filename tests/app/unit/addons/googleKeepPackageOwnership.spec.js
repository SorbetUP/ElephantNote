import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  keepDocumentToMarkdown,
  parseKeepDocument,
  safeNoteStem
} from '../../../../addons/official/google-keep-import/main.js'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Google Keep physical package ownership', () => {
  it('declares a narrow Markdown write scope', () => {
    const manifest = JSON.parse(read('addons/official/google-keep-import/manifest.json'))

    expect(manifest.version).toBe('1.2.0')
    expect(manifest.description).toMatch(/Takeout JSON/i)
    expect(manifest.permissions.notes.read).toEqual([])
    expect(manifest.permissions.notes.write).toEqual(['Imported/Google Keep/**'])
    expect(manifest.runtime.mode).toBe('trusted')
  })

  it('converts Keep text, checklist and metadata into Markdown', () => {
    const note = parseKeepDocument({
      title: 'Release checklist',
      textContent: 'Prepare the release.',
      listContent: [
        { text: 'Run tests', isChecked: true },
        { text: 'Publish build', isChecked: false }
      ],
      labels: [{ name: 'Work' }, { name: 'Elephant' }],
      createdTimestampUsec: '1721000000000000',
      userEditedTimestampUsec: '1721003600000000',
      isPinned: true,
      isArchived: false
    }, 'Release checklist.json')
    const markdown = keepDocumentToMarkdown(note)

    expect(note.title).toBe('Release checklist')
    expect(note.labels).toEqual(['Work', 'Elephant'])
    expect(markdown).toContain('source: google-keep')
    expect(markdown).toContain('pinned: true')
    expect(markdown).toContain('- [x] Run tests')
    expect(markdown).toContain('- [ ] Publish build')
    expect(markdown).toContain('# Release checklist')
  })

  it('sanitizes note filenames for every desktop platform', () => {
    expect(safeNoteStem('  A/B:C*D?  ')).toBe('A-B-C-D-')
    expect(safeNoteStem('')).toBe('Untitled Keep note')
  })

  it('uses only the permission-scoped generic note writer', () => {
    const source = read('addons/official/google-keep-import/main.js')
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const noteAccess = read('Elephant/backend/tauri/src/addon_note_access.rs')

    expect(source).toContain("const PROVIDER_RESOURCE = 'import.google-keep'")
    expect(source).toContain("this.invoke('tauri_addons_notes_write'")
    expect(source).toContain('addonId: ADDON_ID')
    expect(source).toContain('api.resources.provide(PROVIDER_RESOURCE')
    expect(source).not.toContain('elephantnote.api')
    expect(source).not.toContain('import.googleKeep')
    expect(source).not.toContain('sources.ingestUrl')
    expect(source).not.toContain('sources.importRss')
    expect(core).toContain('addon_note_access::tauri_addons_notes_write')
    expect(noteAccess).toContain('record.manifest.permissions.notes.write')
    expect(noteAccess).toContain('prepare_write_target')
    expect(noteAccess).toContain('write_markdown_atomic')
  })
})
