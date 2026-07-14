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

  it('does not expose core semantic inspection or rebuild commands', () => {
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    const commands = read('Elephant/backend/tauri/src/core_commands.rs')
    expect(fs.existsSync(path.join(root, 'Elephant/backend/tauri/src/tauri_extra_commands.rs'))).toBe(false)
    expect(lib).not.toContain('tauri_extra_commands::tauri_search_rebuild')
    expect(lib).not.toContain('tauri_extra_commands::tauri_search_inspect')
    expect(commands).not.toContain('tauri_search_rebuild')
    expect(commands).not.toContain('tauri_search_inspect')
    expect(commands).not.toContain('portable-markdown-index')
  })

  it('keeps only native filename and text search as a core capability', () => {
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    const contracts = read('Elephant/shared/apiContracts.js')
    const compatibility = read('Elephant/frontend/app/services/elephantnoteClient/compatibilityCalls.js')
    expect(lib).toContain('vault::commands::tauri_search_query')
    expect(lib).toContain('vault::commands::tauri_search_status')
    expect(contracts).toContain("action('SEARCH_QUERY', 'search.query'")
    expect(contracts).toContain("action('SEARCH_STATUS', 'search.status')")
    expect(contracts).not.toContain('search.inspect')
    expect(compatibility).not.toContain('search.inspect')
  })

  it('keeps semantic indexing and inspection owned by the Search package', () => {
    const source = read('addons/official/ai-search/main.js')
    expect(source).toContain("engine: 'package-owned-bm25'")
    expect(source).toContain('api.storage.set(INDEX_KEY, this.index)')
    expect(source).toContain('api.resources.provide(PROVIDER_RESOURCE')
  })
})
