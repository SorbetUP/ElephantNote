import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const discovery = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_discovery.rs', 'utf8')
const wikiView = fs.readFileSync('Elephant/frontend/app/components/views/WikiView.vue', 'utf8')
const library = fs.readFileSync('Elephant/backend/tauri/src/knowledge_wiki_library.rs', 'utf8')

describe('Wiki macro-topic discovery contracts', () => {
  it('merges micro-clusters and expands sources globally', () => {
    expect(discovery).toContain('cluster_ids: Vec<usize>')
    expect(discovery).toContain('fn minimum_topic_sources')
    expect(discovery).toContain('fn expanded_members')
    expect(discovery).toContain('background_p90')
    expect(discovery).not.toContain('selected.len() < target')
    expect(discovery).toContain('wiki:macro-candidate')
    expect(discovery).toContain("DELETE FROM wiki_saved_candidates WHERE origin='semantic'")
  })

  it('ranks durable coverage ahead of tiny high-coherence clusters', () => {
    expect(discovery).toContain('.saturating_mul(1_000)')
    expect(discovery).toContain('candidate_overlap')
    expect(discovery).toContain('at least {} core notes after merging')
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
