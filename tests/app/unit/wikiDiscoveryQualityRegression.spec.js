import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const discoveryFacade = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs', 'utf8')
const discoveryEngine = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery/engine.rs', 'utf8')
const discovery = `${discoveryFacade}\n${discoveryEngine}`
const topicGraph = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery/topic_graph.rs', 'utf8')
const wikiView = fs.readFileSync('Elephant/frontend/app/components/views/WikiView.vue', 'utf8')
const library = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_library.rs', 'utf8')

describe('Wiki macro-topic discovery contracts', () => {
  it('uses canonical multi-view embeddings instead of only the first chunks', () => {
    expect(discovery).toContain('document_text_views')
    expect(discovery).toContain('average_vectors')
    expect(discovery).toContain('wiki-multiview-v3')
    expect(discovery).toContain('EmbeddingStore')
    expect(discovery).toContain('tauri_knowledge_wiki_embedding_map')
    expect(discovery).toContain('chunks ORDER BY document_path, ordinal')
    expect(discovery).not.toContain('ORDER BY ordinal LIMIT 4')
  })

  it('builds deterministic graph communities and assigns notes competitively', () => {
    expect(discovery).toContain('build_topic_communities')
    expect(discovery).toContain('build_assignment_profile')
    expect(discovery).toContain('assign_competitively')
    expect(discovery).toContain('refine_assignment_locally')
    expect(discovery).toContain('semantic-discovery-v2')
    expect(topicGraph).toContain('mutual')
    expect(topicGraph).toContain('label_propagation')
    expect(topicGraph).toContain('background_p95')
    expect(topicGraph).toContain('local_threshold')
    expect(topicGraph).not.toContain('selected.len() < target')
    expect(discovery).toContain("DELETE FROM wiki_saved_candidates WHERE origin='semantic'")
  })

  it('filters generic topics and avoids duplicated or existing Wikis', () => {
    expect(discovery).toContain('is_generic_topic')
    expect(discovery).toContain('existing-wiki-overlap')
    expect(discovery).toContain('candidate_overlap')
    expect(discovery).toContain('target_topic_limit')
  })

  it('does not mix legacy lexical micro-candidates into semantic proposals', () => {
    expect(library).not.toContain('tauri_knowledge_wiki_candidates(app')
    expect(library).not.toContain('fn candidate_item(candidate: WikiCandidate)')
  })

  it('shows evidence instead of an opaque source total', () => {
    expect(discovery).toContain('core_source_count')
    expect(discoveryFacade).toContain('persist_candidate_metadata')
    expect(discoveryFacade).toContain('metadata_json')
    expect(library).toContain('core_source_count')
    expect(wikiView).toContain('note{{ entry.coreSourceCount === 1')
    expect(wikiView).toContain('Sujet solide')
    expect(wikiView).toContain('relatedSourceCount')
  })

  it('uses an inline two-step delete confirmation', () => {
    expect(wikiView).toContain("const deleteConfirmId = ref('')")
    expect(wikiView).toContain('Confirmer la suppression')
    expect(wikiView).not.toContain('globalThis.confirm')
  })

  it('configures the local embedding physical batch above the old 512 default', () => {
    const runtime = fs.readFileSync('Elephant/backend/tauri/src/local_llama_runtime.rs', 'utf8')
    const aiSettings = fs.readFileSync('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue', 'utf8')
    expect(runtime).toContain('DEFAULT_EMBEDDING_PHYSICAL_BATCH_SIZE: u64 = 1024')
    expect(runtime).toContain('--ubatch-size')
    expect(runtime).toContain('embedding_capacity_error')
    expect(aiSettings).toContain('Physical batch size')
    expect(aiSettings).toContain('embeddingPhysicalBatchSize')
    expect(aiSettings).toContain('defaultLocalRuntime')
    expect(aiSettings).toContain('localRuntime: defaultLocalRuntime()')
    expect(aiSettings).toContain('...clonePlainObject(form.value.localRuntime)')
    expect(aiSettings).toContain('1024')
  })
})
