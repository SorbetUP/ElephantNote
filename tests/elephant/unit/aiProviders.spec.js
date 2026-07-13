import { describe, expect, it } from 'vitest'
import {
  ELEPHANTNOTE_AI_PRESETS,
  createAiRequestBody,
  extractAiResponseText,
  normalizeAiConfig,
  normalizeAiEndpoint,
  resolveAiEndpoint
} from 'common/elephantnote/aiProviders'

describe('ElephantNote AI providers', () => {
  it('accepts IP and port endpoints without a scheme', () => {
    expect(normalizeAiEndpoint('192.168.1.25:11434/api/chat')).toBe('http://192.168.1.25:11434/api/chat')
    expect(normalizeAiEndpoint('localhost:1234/v1/chat/completions')).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('normalizes Ollama base URLs to the chat API route', () => {
    expect(resolveAiEndpoint({ transport: 'ollama', endpoint: 'http://127.0.0.1:11434' })).toBe('http://127.0.0.1:11434/api/chat')
    expect(resolveAiEndpoint({ transport: 'ollama', endpoint: '127.0.0.1:11434/api/chat' })).toBe('http://127.0.0.1:11434/api/chat')
  })

  it('uses the Tauri Rust local runtime by default', () => {
    expect(normalizeAiConfig({})).toMatchObject({
      preset: 'tauriRustLocal',
      transport: 'tauri-rust',
      endpoint: ELEPHANTNOTE_AI_PRESETS.tauriRustLocal.endpoint
    })
    expect(resolveAiEndpoint({ transport: 'tauri-rust', endpoint: '' })).toBe('')
  })

  it('migrates removed local presets and preserves supported remote presets', () => {
    expect(normalizeAiConfig({ preset: 'nodeLlamaCpp' })).toMatchObject({
      preset: 'tauriRustLocal',
      transport: 'tauri-rust',
      endpoint: ELEPHANTNOTE_AI_PRESETS.tauriRustLocal.endpoint
    })
    expect(normalizeAiConfig({ preset: 'mlx' })).toMatchObject({
      preset: 'mlx',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ preset: 'openrouter' })).toMatchObject({
      preset: 'openrouter',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ preset: 'codex' })).toMatchObject({
      preset: 'codex',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ enabled: false })).not.toHaveProperty('enabled')
  })

  it('creates provider request bodies and extracts common response shapes', () => {
    const messages = [{ role: 'user', content: 'Hello' }]
    expect(createAiRequestBody({ transport: 'node-llama-cpp', model: 'local.gguf', messages })).toEqual({
      model: 'local.gguf',
      messages,
      stream: false
    })
    expect(createAiRequestBody({ transport: 'ollama', model: 'llama3.2', messages })).toEqual({
      model: 'llama3.2',
      messages,
      stream: false
    })
    expect(extractAiResponseText({ message: { content: 'Ollama response' } })).toBe('Ollama response')
    expect(extractAiResponseText({ choices: [{ message: { content: 'OpenAI response' } }] })).toBe('OpenAI response')
  })
})
