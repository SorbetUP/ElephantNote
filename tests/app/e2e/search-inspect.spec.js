const { expect, test } = require('playwright/test')

test.describe('Knowledge graph renderer bridge', () => {
  test('returns every projected note without a renderer window', async({ page }) => {
    await page.goto('/')

    const result = await page.evaluate(async() => {
      const nodes = Array.from({ length: 1389 }, (_, index) => ({
        id: `Note-${index}.md`,
        path: `Note-${index}.md`,
        title: `Note ${index}`,
        kind: 'note'
      }))
      window.__TAURI__ = {
        core: {
          invoke: async(command) => {
            if (command === 'tauri_debug_log') return true
            if (command === 'tauri_knowledge_status') {
              return { documents: nodes.length, chunks: 2200, database_path: '/vault/.elephantnote/knowledge/knowledge.sqlite' }
            }
            if (command === 'tauri_knowledge_graph') return { nodes, edges: [], clusters: [] }
            return null
          }
        }
      }
      window.elephantnote = {}
      const { installKnowledgeRuntimeBridge } = await import('/src/platform/installKnowledgeRuntimeBridge.js')
      if (!installKnowledgeRuntimeBridge(window)) throw new Error('Knowledge bridge did not install')
      return window.elephantnote.search.inspect({ vaultPath: '/vault' })
    })

    expect(result.graph.rendererLimited).toBe(false)
    expect(result.graph.hiddenNodeCount).toBe(0)
    expect(result.graph.nodes).toHaveLength(1389)
    expect(result.documents).toHaveLength(1389)
  })
})
