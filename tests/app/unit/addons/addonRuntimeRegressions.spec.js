import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { reconcileOfficialAddonRecords } from '../../../../Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('addon runtime regression repairs', () => {
  it('restores official provenance for historical registry records', () => {
    const [record] = reconcileOfficialAddonRecords(
      [{ source: 'external', manifest: { id: 'elephant.wiki' } }],
      [{ id: 'elephant.wiki', official: true }]
    )

    expect(record.source).toBe('official')
    expect(record.official).toBe(true)
    expect(record.manifest.source).toBe('official')
    expect(record.manifest.official).toBe(true)
  })

  it('never promotes a package absent from the verified official catalogue', () => {
    const [record] = reconcileOfficialAddonRecords(
      [{ source: 'external', manifest: { id: 'elephant.fake' } }],
      [{ id: 'elephant.wiki', official: true }]
    )

    expect(record.source).toBe('external')
    expect(record.official).toBeUndefined()
  })

  it('materializes missing native services during addon synchronization', () => {
    const sync = read('build/scripts/sync-elephant-addons.mjs')
    const builder = read('build/scripts/build-physical-addon.mjs')

    expect(sync).toContain('materializeNativeServices()')
    expect(sync).toContain('ELEPHANT_ADDON_MATERIALIZE_SOURCE')
    expect(sync).toContain('Native addon service was not materialized')
    expect(builder).toContain('ELEPHANT_ADDON_MATERIALIZE_ONLY')
    expect(builder).toContain('materialized=${sourceSidecar}')
  })

  it('does not truncate large vaults at one thousand notes', () => {
    const source = read('Elephant/backend/tauri/src/addon_note_access.rs')

    expect(source).not.toContain('MAX_LISTED_NOTES')
    expect(source).not.toContain('Addon note listing exceeded the maximum of')
    expect(source).toContain('MAX_DIRECTORY_DEPTH')
    expect(source).toContain('MAX_NOTE_BYTES')
    expect(source).toContain('read_enabled_addon')
  })
})
