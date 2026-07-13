import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('AI provider execution ownership', () => {
  it('keeps the chat addon as an orchestrator over installed provider contributions', () => {
    const chat = read('addons/official/ai-chat/main.js')

    expect(chat).toContain("getContributions?.('ai.providers')")
    expect(chat).toContain("this.api.resources.get(SEARCH_RESOURCE)")
    expect(chat).toContain('await option.provider.chat({')
    expect(chat).not.toContain("this.call('rag.chat'")
  })

  it('exposes service-backed chat functions from Open Models and Codex packages', () => {
    const openModels = read('addons/official/open-models/main.js')
    const codex = read('addons/official/codex-connection/main.js')

    expect(openModels).toContain("chat({ messages = [], model = '', route = {}, config = {} } = {})")
    expect(openModels).toContain("return this.service('models.chat'")
    expect(openModels).toContain('chat: (request) => this.chat(request)')
    expect(codex).toContain("async chat({ messages = [], model = '', route = {} } = {})")
    expect(codex).toContain("this.service('codex.chat'")
    expect(codex).toContain('chat: (request) => this.chat(request)')
  })

  it('offers only actual installed or configured providers in chat settings', () => {
    const chat = read('addons/official/ai-chat/main.js')

    expect(chat).toContain("const disabled = node(documentRef, 'option', '', 'Disabled')")
    expect(chat).toContain('for (const option of options)')
    expect(chat).toContain('Install a provider addon or configure an external API first.')
    expect(chat).not.toContain('Unavailable addon provider')
    expect(chat).not.toContain('SmolLM2')
  })
})
