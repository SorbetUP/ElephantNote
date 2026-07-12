from pathlib import Path

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count == 1:
        write(path, content.replace(old, new, 1))
        return
    if count == 0 and new in content:
        return
    raise RuntimeError(f'{path}: expected one old match or an already-applied replacement, found {count}')


helper = 'Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'
replace_once(
    helper,
    "const normalizeNodeId = (node = {}) => String(node.relativePath || node.path || node.id || '').trim()",
    "const normalizeNodeId = (node = {}) => String(node.id || node.relativePath || node.path || '').trim()"
)

graph_view = 'Elephant/frontend/app/components/views/GraphView.vue'
replace_once(
    graph_view,
    """  if (node.kind === 'wiki') {
    const draftId = node.id.replace(/^wiki:/, '')
    log.info('[Graph][Wiki] open', { nodeId: node.id, draftId, title: node.title })
    window.sessionStorage.setItem('elephantnote:openWikiDraftId', draftId)
    store.setWorkspaceView('wiki')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('elephantnote:open-wiki', { detail: { draftId } }))
    })
    return
  }""",
    """  if (node.kind === 'wiki') {
    const draftId = node.id.replace(/^wiki:/, '')
    const wikiPath = String(node.relativePath || node.path || '').trim()
    log.info('[Graph][Wiki] open', { nodeId: node.id, draftId, title: node.title, path: wikiPath || null })
    if (wikiPath && wikiPath.endsWith('.md')) {
      store.openNote({
        path: wikiPath,
        title: node.title || wikiPath.split('/').pop()?.replace(/\\.md$/i, '') || 'Wiki',
        kind: 'note',
        type: 'note'
      })
      return
    }
    window.sessionStorage.setItem('elephantnote:openWikiDraftId', draftId)
    store.setWorkspaceView('wiki')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('elephantnote:open-wiki', { detail: { draftId } }))
    })
    return
  }"""
)
replace_once(
    graph_view,
    """onMounted(() => loadGraph('mount').catch(() => {}))
watch(() => store.activeVault?.path, async(newPath, oldPath) => {""",
    """const handleKnowledgeChanged = (event) => {
  const reason = event?.detail?.reason || 'knowledge-changed'
  void loadGraph(reason).catch(() => {})
}

onMounted(() => {
  window.addEventListener('elephantnote:knowledge-changed', handleKnowledgeChanged)
  void loadGraph('mount').catch(() => {})
})
watch(() => store.activeVault?.path, async(newPath, oldPath) => {"""
)
replace_once(
    graph_view,
    """onBeforeUnmount(() => {
  cancelCameraAnimation()""",
    """onBeforeUnmount(() => {
  window.removeEventListener('elephantnote:knowledge-changed', handleKnowledgeChanged)
  cancelCameraAnimation()"""
)

test_path = 'tests/app/unit/wikiGraphSurface.spec.js'
write(
    test_path,
    """import { describe, expect, it } from 'vitest'

import { buildSemanticGraphSurface } from '../../../Elephant/frontend/app/components/views/semanticGraphViewHelpers.js'

describe('Wiki graph surface', () => {
  it('preserves backend Wiki node identities and keeps their edges visible', () => {
    const surface = buildSemanticGraphSurface({
      graph: {
        nodes: [
          {
            id: 'wiki:one',
            path: '.elephantnote/wiki/wiki-one.md',
            relativePath: '.elephantnote/wiki/wiki-one.md',
            kind: 'wiki',
            title: 'Wiki one'
          },
          {
            id: 'wiki:two',
            path: '.elephantnote/wiki/wiki-two.md',
            relativePath: '.elephantnote/wiki/wiki-two.md',
            kind: 'wiki',
            title: 'Wiki two'
          },
          { id: 'Notes/A.md', path: 'Notes/A.md', relativePath: 'Notes/A.md', kind: 'note', title: 'A' }
        ],
        edges: [
          { source: 'wiki:one', target: 'Notes/A.md', edgeType: 'wiki-source' },
          { source: 'wiki:one', target: 'wiki:two', edge_type: 'wiki-link' }
        ],
        clusters: [
          { id: 'wiki:one', label: 'Wiki one', paths: ['wiki:one', 'Notes/A.md'] }
        ]
      }
    })

    expect(surface.nodes.map((node) => node.id)).toEqual(['wiki:one', 'wiki:two', 'Notes/A.md'])
    expect(surface.nodeMap.get('wiki:one')?.relativePath).toBe('.elephantnote/wiki/wiki-one.md')
    expect(surface.edges.map((edge) => edge.type)).toEqual(['wiki-source', 'wiki-link'])
    expect(surface.edgeCounts.get('wiki:one')).toBe(2)
    expect(surface.edgeCounts.get('Notes/A.md')).toBe(1)
    expect(surface.clusters[0]?.paths).toContain('wiki:one')
  })
})
"""
)
