import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('physical Knowledge addon', () => {
  it('owns the imported knowledge engine and publishes a versioned resource', () => {
    const manifest = JSON.parse(read('addons/official/knowledge/manifest.json'))
    const entry = read('addons/official/knowledge/main.js')
    const service = read('addons/official/knowledge/native/src/main.rs')
    expect(manifest.native.runner).toBe('service')
    expect(entry).toContain("api.resources.provide(RESOURCE_ID")
    expect(entry).toContain("apiVersion: 1")
    expect(entry).toContain("owner: ADDON_ID")
    expect(service).toContain('rebuild_vault')
    expect(service).toContain('graph_projection')
    expect(service).toContain('knowledge.wiki.render')
  })

  it('does not restore the historical knowledge backend to Tauri core', () => {
    const tauri = fs.readdirSync(path.join(root, 'Elephant/backend/tauri/src'))
    expect(tauri).not.toContain('knowledge.rs')
    expect(tauri).not.toContain('knowledge_wikis.rs')
    expect(tauri).not.toContain('knowledge_graph.rs')
  })
})
