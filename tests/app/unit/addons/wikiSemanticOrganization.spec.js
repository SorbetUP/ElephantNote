import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('physical Wiki semantic organization', () => {
  it('keeps topic discovery in the Knowledge package instead of Tauri core', () => {
    const core = read('addons/official/knowledge/native/knowledge-core/src/wiki_discovery.rs')
    const service = read('addons/official/knowledge/native/src/main.rs')
    const provider = read('addons/official/knowledge/main.js')
    const tauriFiles = fs.readdirSync(path.join(root, 'Elephant/backend/tauri/src'))

    expect(core).toContain('discover_topic_communities')
    expect(core).toContain('finalize_semantic_candidates')
    expect(core).toContain('core_source_count')
    expect(core).toContain('distinctiveness')
    expect(service).toContain('knowledge.wiki.semantic.communities')
    expect(service).toContain('knowledge.wiki.semantic.discover')
    expect(provider).toContain('semanticCommunities:')
    expect(provider).toContain('semanticDiscover:')
    expect(tauriFiles).not.toContain('knowledge_wiki_discovery.rs')
    expect(tauriFiles).not.toContain('knowledge_wikis.rs')
  })

  it('lets the Wiki package consume semantic evidence and retain an explicit fallback', () => {
    const wiki = read('addons/official/wiki/main.js')
    const semantic = read('addons/official/wiki/semanticWikiProposals.js')

    expect(wiki).toContain('discoverSemanticWikiRecords')
    expect(wiki).toContain("engine: 'knowledge-semantic-v2'")
    expect(wiki).toContain("engine: 'lexical-fallback'")
    expect(wiki).toContain('coreSourceCount')
    expect(semantic).toContain('overlap >= 0.72')
    expect(semantic).toContain('qualityLabel')
    expect(semantic).toContain('knowledge.semanticDiscover')
  })

  it('publishes embedding ingestion through the package resource boundary', () => {
    const provider = read('addons/official/knowledge/main.js')
    const service = read('addons/official/knowledge/native/src/main.rs')

    expect(provider).toContain('pendingEmbeddings:')
    expect(provider).toContain('saveEmbeddings:')
    expect(provider).toContain('embeddingStatus:')
    expect(service).toContain('knowledge.embedding.pending')
    expect(service).toContain('knowledge.embedding.save')
    expect(service).toContain('EmbeddingStore')
  })
})
