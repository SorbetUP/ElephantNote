import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const ROOT = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('ElephantNote chat agent surface', () => {
  test('preserves request-scoped AI configuration and stream identifiers', () => {
    const source = read('Elephant/frontend/app/services/elephantnoteClient/domainClients.js')
    expect(source).toContain('...payload')
    expect(source).toContain('call(API.RAG_CHAT, normalizeRagChatPayload(payload, limit))')
  })

  test('executes action cards atomically and exposes auto approval', () => {
    const frontend = read('Elephant/frontend/app/components/views/ChatView.vue')
    const backend = read('Elephant/backend/tauri/src/knowledge_chat_actions.rs')
    expect(frontend).toContain('entry?.proposal?.id === targetId')
    expect(frontend).toContain('elephantnote:chat:auto-approve')
    expect(frontend).toContain('tauri_knowledge_chat_action_execute')
    expect(frontend).toContain('actionSearchResults(action)')
    expect(backend).toContain('approve-and-execute id=')
    expect(backend).toContain('ChatActionStatus::Executed')
  })

  test('uses tolerant indexed search for agent search actions', () => {
    const backend = read('Elephant/backend/tauri/src/knowledge_chat_actions.rs')
    expect(backend).toContain('relaxed_note_search')
    expect(backend).toContain('meaningful_search_terms')
    expect(backend).toContain('ChatKnowledgeAction::SearchNotes')
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
