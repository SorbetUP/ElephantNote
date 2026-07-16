import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('package-owned chat boundary', () => {
  it('does not expose RAG chat or semantic initialization through core clients', () => {
    const clients = createDomainClients(async() => ({}), () => ({}))

    expect(clients.rag).toBeUndefined()
    expect(clients.chat).toBeUndefined()
    expect(API.RAG_CHAT).toBeUndefined()
    expect(API.SEARCH_INIT_VAULT).toBeUndefined()
    expect(API.SEARCH_REBUILD).toBeUndefined()
  })

  it('orchestrates chat from the physical AI Chat package', () => {
    const chat = read('addons/official/ai-chat/main.js')

    expect(chat).toContain("getContributions?.('ai.providers')")
    expect(chat).toContain("this.api.resources.get(SEARCH_RESOURCE)")
    expect(chat).toContain("typeof option.provider.chat !== 'function'")
    expect(chat).not.toContain("this.call('rag.chat'")
    expect(chat).not.toContain('SEARCH_INIT_VAULT')
  })

  it('keeps provider implementations in separate packages', () => {
    const openModels = read('addons/official/open-models/main.js')
    const codex = read('addons/official/codex-connection/main.js')

    expect(openModels).toContain("registerContribution('ai.providers'")
    expect(codex).toContain("registerContribution('ai.providers'")
    expect(openModels).toContain('chat: (request) => this.chat(request)')
    expect(codex).toContain('chat: (request) => this.chat(request)')
  })
})
