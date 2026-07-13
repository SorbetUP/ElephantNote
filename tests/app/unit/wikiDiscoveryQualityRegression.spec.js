import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const discovery = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs', 'utf8')
const topicGraph = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery/topic_graph.rs', 'utf8')
const wikiView = fs.readFileSync('Elephant/frontend/app/components/views/WikiView.vue', 'utf8')
const library = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_library.rs', 'utf8')

describe('Wiki macro-topic discovery contracts', () => {
  it('builds deterministic graph communities and assigns notes competitively', () => {
    expect(discovery).toContain('build_topic_communities')
    expect(discovery).toContain('build_assignment_profile')
    expect(discovery).toContain('assign_competitively')
    expect(discovery).toContain('semantic-discovery-v2')
    expect(topicGraph).toContain('mutual')
    expect(topicGraph).toContain('label_propagation')
    expect(topicGraph).toContain('background_p95')
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

  it('uses an inline two-step delete confirmation', () => {
    expect(wikiView).toContain("const deleteConfirmId = ref('')")
    expect(wikiView).toContain('Confirmer la suppression')
    expect(wikiView).not.toContain('globalThis.confirm')
  })
})
