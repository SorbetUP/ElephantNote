import { describe, expect, it } from 'vitest'
import {
  clonePlainObject,
  createNodeLlamaCppTestConfig
} from '../../front/app/components/settings/settingsModelHelpers.js'

describe('settings model helpers', () => {
  it('creates a plain Tauri Rust local test payload from reactive state', () => {
    const aiConfig = new Proxy(
      {
        preset: 'custom',
        transport: 'openai-compatible',
        endpoint: 'https://example.invalid/v1/chat/completions',
        model: 'fallback-model',
        apiKey: 'secret'
      },
      {}
    )
    const modelSelection = new Proxy(
      {
        chat: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M'
      },
      {}
    )

    const payload = createNodeLlamaCppTestConfig({
      aiConfig,
      modelSelection,
      fallbackChatModelId: 'fallback-chat-model'
    })

    expect(payload).toMatchObject({
      preset: 'tauriRustLocal',
      transport: 'tauri-rust',
      endpoint: 'tauri-rust://local',
      model: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
      apiKey: 'secret',
      codexLinkEnabled: true
    })
    expect(() => structuredClone(payload)).not.toThrow()
  })

  it('falls back to the existing AI model when no chat slot is selected', () => {
    const payload = createNodeLlamaCppTestConfig({
      aiConfig: { model: 'existing-model' },
      modelSelection: { chat: '' }
    })

    expect(payload.model).toBe('existing-model')
  })

  it('clones plain object payloads safely', () => {
    const payload = clonePlainObject(
      new Proxy(
        {
          nested: { value: 1 },
          list: [1, 2, 3]
        },
        {}
      )
    )

    expect(payload).toEqual({
      nested: { value: 1 },
      list: [1, 2, 3]
    })
    expect(() => structuredClone(payload)).not.toThrow()
  })
})
