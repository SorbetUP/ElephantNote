import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('legacy semantic backend physical absence', () => {
  it('does not ship the old embedding database module in Elephant core', () => {
    expect(fs.existsSync(path.join(root, 'Elephant/backend/tauri/src/embeddings.rs'))).toBe(false)
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    expect(lib).not.toContain('pub mod embeddings;')
    expect(lib).not.toContain('embeddings::tauri_embeddings_')
  })

  it('does not expose the old global semantic rebuild command', () => {
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    expect(lib).not.toContain('tauri_extra_commands::tauri_search_rebuild')
  })

  it('keeps native filename search and inspection as core capabilities', () => {
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    const commands = read('Elephant/backend/tauri/src/tauri_extra_commands.rs')
    expect(lib).toContain('vault::commands::tauri_search_query')
    expect(lib).toContain('tauri_extra_commands::tauri_search_inspect')
    expect(commands).toContain('pub fn tauri_search_inspect')
  })

  it('keeps semantic indexing owned by the Search package', () => {
    const source = read('addons/official/ai-search/main.js')
    expect(source).toContain("engine: 'package-owned-bm25'")
    expect(source).toContain('api.storage.set(INDEX_KEY, this.index)')
    expect(source).toContain('api.resources.provide(PROVIDER_RESOURCE')
  })
})
