import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoLlamaRuntime } from '../../../Elephant/shared/ai/autoLlamaRuntime.js'

describe('AutoLlamaRuntime', () => {
  afterEach(() => {
    if (globalThis.window?.elephantnote) {
      delete globalThis.window.elephantnote
    }
    if (globalThis.window?.__TAURI__) {
      delete globalThis.window.__TAURI__
    }
  })

  it('routes chat through the Tauri bridge and keeps WASM for embeddings', async() => {
    const bridgeChat = vi.fn(async(payload) => ({
      backend: 'rust',
      response: `tauri:${payload.prompt}`
    }))
    window.elephantnote = {
      rag: {
        chat: bridgeChat
      }
    }
    window.__TAURI__ = {}

    const wasmSession = {
      embed: vi.fn(async(payload) => ({
        backend: 'cpu',
        vector: [payload.input.length]
      }))
    }
    const wasmRuntime = {
      status: vi.fn(async() => ({
        available: true,
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu'
      })),
      loadModel: vi.fn(async() => wasmSession)
    }

    const runtime = new AutoLlamaRuntime({ wasmRuntime })
    const status = await runtime.status()
    expect(status.engine).toBe('tauri-rust')
    expect(status.available).toBe(true)

    const session = await runtime.loadModel({
      modelUrl: 'model.gguf',
      model: {
        id: 'model-id',
        name: 'Model Name'
      }
    })

    const chatResult = await session.chat({ prompt: 'hello' })
    expect(bridgeChat).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'hello',
      backend: 'cpu',
      model: {
        id: 'model-id',
        name: 'Model Name'
      }
    }))
    expect(chatResult).toMatchObject({
      backend: 'cpu',
      fallbackNotice: ''
    })
    expect(chatResult.text).toBe('tauri:hello')

    const embedResult = await session.embed({ input: 'abc' })
    expect(wasmSession.embed).toHaveBeenCalledWith({ input: 'abc' })
    expect(embedResult).toMatchObject({
      backend: 'cpu',
      vector: [3]
    })
  })

  it('falls back to WASM when the Tauri bridge is missing', async() => {
    const wasmSession = {
      chat: vi.fn(async() => ({
        backend: 'cpu',
        text: 'wasm-chat'
      })),
      complete: vi.fn(async() => ({
        backend: 'cpu',
        text: 'wasm-complete'
      })),
      embed: vi.fn(async() => ({
        backend: 'cpu',
        vector: [1, 2, 3]
      }))
    }
    const wasmRuntime = {
      status: vi.fn(async() => ({
        available: true,
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu'
      })),
      loadModel: vi.fn(async() => wasmSession)
    }

    const runtime = new AutoLlamaRuntime({ wasmRuntime })
    const session = await runtime.loadModel({
      modelUrl: 'model.gguf'
    })

    const chatResult = await session.chat({ prompt: 'fallback' })
    expect(chatResult.text).toBe('wasm-chat')
    expect(wasmSession.chat).toHaveBeenCalledWith({ prompt: 'fallback' })
  })
})
