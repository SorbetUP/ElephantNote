import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const ROOT = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('ElephantNote chat agent surface', () => {
  test('preserves request-scoped AI configuration and stream identifiers', () => {
    const source = read('Elephant/frontend/app/services/elephantnoteClient/domainClients.js')
    expect(source).toContain('...payload')
    expect(source).toContain("call(API.RAG_CHAT, normalizeRagChatPayload(payload, limit))")
  })

  test('updates action cards by stable proposal id and exposes auto approval', () => {
    const source = read('Elephant/frontend/app/components/views/ChatView.vue')
    expect(source).toContain('entry?.proposal?.id === targetId')
    expect(source).toContain('elephantnote:chat:auto-approve')
    expect(source).toContain('tauri_knowledge_chat_action_approve')
    expect(source).toContain('actionSearchResults(action)')
  })

  test('consumes scoped Codex stream events and provides route controls', () => {
    const source = read('Elephant/frontend/app/components/views/ChatView.vue')
    expect(source).toContain("listen('elephantnote://chat-stream', handleStreamEvent)")
    expect(source).toContain('v-model="selectedModel"')
    expect(source).toContain('v-model="reasoningEffort"')
    expect(source).toContain('Recherche et raisonnement…')
  })

  test('keeps unrelated graph nodes visible by default', () => {
    const source = read('Elephant/frontend/app/components/views/AtomicGraphView.vue')
    expect(source).toContain('const filterOrphans = ref(true)')
  })
})
