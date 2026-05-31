import { describe, expect, it } from 'vitest'
import {
  ELEPHANTNOTE_AI_PRESETS,
  createAiRequestBody,
  extractAiResponseText,
  normalizeAiConfig,
  normalizeAiEndpoint
} from 'common/elephantnote/aiProviders'

describe('ElephantNote AI providers', () => {
  it('accepts IP and port endpoints without a scheme', () => {
    expect(normalizeAiEndpoint('192.168.1.25:11434/api/chat')).toBe('http://192.168.1.25:11434/api/chat')
    expect(normalizeAiEndpoint('localhost:1234/v1/chat/completions')).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('normalizes known local presets', () => {
    expect(normalizeAiConfig({ preset: 'ollama' })).toMatchObject({
      preset: 'ollama',
      transport: 'ollama',
      endpoint: ELEPHANTNOTE_AI_PRESETS.ollama.endpoint
    })
    expect(normalizeAiConfig({ preset: 'codex' })).toMatchObject({
      preset: 'codex',
      transport: 'openai-compatible'
    })
  })

  it('creates provider request bodies and extracts common response shapes', () => {
    const messages = [{ role: 'user', content: 'Hello' }]
    expect(createAiRequestBody({ transport: 'ollama', model: 'llama3.2', messages })).toEqual({
      model: 'llama3.2',
      messages,
      stream: false
    })
    expect(extractAiResponseText({ message: { content: 'Ollama response' } })).toBe('Ollama response')
    expect(extractAiResponseText({ choices: [{ message: { content: 'OpenAI response' } }] })).toBe('OpenAI response')
  })
})
