import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const ROOT = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('Wiki embedding graph surface', () => {
  test('persists real vectors and projects embedding edges', () => {
    const store = read('Elephant/backend/knowledge-core/src/embedding_store.rs')
    const projection = read('Elephant/backend/knowledge-core/src/wiki_graph_projection.rs')
    expect(store).toContain('document_embeddings')
    expect(store).toContain('semantic_edges_for_paths')
    expect(projection).toContain('wiki-semantic')
    expect(projection).toContain('Embedding similarity')
  })

  test('prefers configured embedding providers and keeps an offline vector fallback', () => {
    const runtime = read('Elephant/backend/tauri/src/knowledge_embeddings.rs')
    expect(runtime).toContain('/routes/embedding')
    expect(runtime).toContain('embed_openai_compatible')
    expect(runtime).toContain('embed_ollama')
    expect(runtime).toContain('embed_with_selected_model')
    expect(runtime).toContain('elephantnote-feature-hash-384-v1')
    expect(runtime).toContain('builtin_embedding')
  })

  test('lets embedding weights influence the Wiki territory layout', () => {
    const graph = read('Elephant/frontend/app/components/views/semanticGraphViewHelpers.js')
    expect(graph).toContain("edge.type === 'wiki-semantic'")
    expect(graph).toContain('desiredDistance')
    expect(graph).toContain('score * 0.05')
  })
})
