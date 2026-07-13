import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const ROOT = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('large-vault graph and Wiki scale regressions', () => {
  test('does not auto-run the quadratic graph simulation or alter zoom on selection', () => {
    const source = read('Elephant/frontend/app/components/views/AtomicGraphView.vue')
    expect(source).not.toContain('runForceSimulation(1200)')
    expect(source).not.toContain('ratio: 0.4')
    expect(source).not.toContain('en-graph-zoom-slider')
    expect(source).toContain('Selecting a note must not rewrite the camera ratio')
  })

  test('assigns deterministic territory colors instead of one global orange', () => {
    const source = read('Elephant/frontend/app/components/views/AtomicGraphView.vue')
    expect(source).toContain('wikiColorById')
    expect(source).toContain('territoryByNode')
    expect(source).toContain('rgbaFromHex(territoryColor')
  })

  test('keeps broad semantic source sets and requests encyclopedic output', () => {
    const discovery = read('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs')
    const wikiCore = read('Elephant/backend/knowledge-core/src/wiki_core.rs')
    expect(discovery).toContain('.take(400)')
    expect(wikiCore).toContain('Wikipedia-quality page')
    expect(wikiCore).toContain('max_output_tokens: 24_576')
  })

  test('enables Codex hosted live web search while keeping read-only sandboxing', () => {
    const source = read('Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs')
    expect(source).toContain('"web_search": "live"')
    expect(source).not.toContain('"tools": {\n          "web_search"')
    expect(source).toContain('"type": TURN_READ_ONLY_SANDBOX')
  })
})
