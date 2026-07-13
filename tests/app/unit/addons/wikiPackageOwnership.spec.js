import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Wiki physical package ownership', () => {
  it('reads notes through the permission-scoped addon command', () => {
    const manifest = JSON.parse(read('addons/official/wiki/manifest.json'))
    const source = read('addons/official/wiki/main.v2.js')

    expect(manifest.version).toBe('1.3.0')
    expect(manifest.runtime.entry).toBe('main.v2.js')
    expect(manifest.permissions.notes.read).toEqual(['*'])
    expect(manifest.permissions.notes.write).toEqual(['Wiki/**'])
    expect(source).toContain("tauri_addons_notes_read")
    expect(source).toContain("addonId: ADDON_ID")
  })

  it('publishes a Wiki provider and optionally composes with Search', () => {
    const source = read('addons/official/wiki/main.v2.js')
    expect(source).toContain("const PROVIDER_RESOURCE = 'wiki.provider'")
    expect(source).toContain("const SEARCH_RESOURCE = 'search.provider'")
    expect(source).toContain('api.resources.provide(PROVIDER_RESOURCE')
    expect(source).toContain('this.api.resources.get(SEARCH_RESOURCE)')
    expect(source).toContain("engine: 'package-owned-wiki'")
  })

  it('does not call the legacy Wiki backend actions', () => {
    const base = read('addons/official/wiki/main.js')
    const source = read('addons/official/wiki/main.v2.js')
    for (const action of ['wiki.list', 'wiki.propose', 'wiki.accept', 'wiki.dismiss', 'wiki.search']) {
      expect(base).not.toContain(action)
      expect(source).not.toContain(action)
    }
  })
})
