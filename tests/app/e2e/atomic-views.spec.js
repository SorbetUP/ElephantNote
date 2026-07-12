const { expect, test } = require('playwright/test')

test.describe('Knowledge wiki renderer bridge', () => {
  test('forwards an app-local wiki request to the Rust command', async({ page }) => {
    await page.goto('/')

    const observed = await page.evaluate(async() => {
      const calls = []
      window.__TAURI__ = {
        core: {
          invoke: async(command, payload) => {
            if (command === 'tauri_debug_log') return true
            calls.push({ command, payload })
            if (command === 'tauri_knowledge_wiki_generate') {
              return {
                draft: { id: 'wiki-1', title: 'Iroh', citations: [], status: 'proposed' },
                provider: 'app-local',
                model: 'tiny.gguf',
                sourceCount: 1,
                chunkCount: 1,
                rawResponse: '{}'
              }
            }
            return null
          }
        }
      }
      window.elephantnote = {}
      const { installKnowledgeRuntimeBridge } = await import('/src/platform/installKnowledgeRuntimeBridge.js')
      if (!installKnowledgeRuntimeBridge(window)) throw new Error('Knowledge bridge did not install')
      const result = await window.elephantnote.knowledge.wikis.generate({
        topic: 'Iroh',
        sourcePaths: ['Iroh.md'],
        payload: {
          aiConfig: {
            routes: {
              chat: { source: 'app-local', model: 'tiny.gguf' }
            }
          }
        }
      })
      return { calls, result }
    })

    expect(observed.result.provider).toBe('app-local')
    expect(observed.result.draft.id).toBe('wiki-1')
    const generation = observed.calls.find((entry) => entry.command === 'tauri_knowledge_wiki_generate')
    expect(generation).toBeTruthy()
    expect(generation.payload.topic).toBe('Iroh')
    expect(generation.payload.payload.aiConfig.routes.chat).toEqual({ source: 'app-local', model: 'tiny.gguf' })
  })
})
