/* @vitest-environment node */

import { afterEach, describe, expect, it } from 'vitest'
import { AutoLlamaRuntime } from 'common/elephantnote/ai/autoLlamaRuntime'

const originalWindow = globalThis.window
const originalDocument = globalThis.document

afterEach(() => {
  globalThis.window = originalWindow
  globalThis.document = originalDocument
})

describe('AutoLlamaRuntime', () => {
  it('uses the portable WASM runtime when the legacy Node runtime is disabled', async() => {
    const nodeRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu', 'openvino'],
        selectedBackend: 'cpu'
      }),
      loadModel: async(model) => ({ model, source: 'node' }),
      generateChat: async() => 'node chat ok',
      embedText: async() => [1, 2, 3]
    }
    const wasmRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu'
      }),
      loadModel: async(model) => ({ backend: 'cpu', modelLabel: model.modelLabel || 'wasm', chat: async() => ({ text: 'wasm chat ok' }), complete: async() => ({ text: 'wasm completion ok' }), embed: async() => ({ vector: [7, 8, 9] }) })
    }

    const runtime = new AutoLlamaRuntime({ nodeRuntime, wasmRuntime })
    const status = await runtime.status()
    const session = await runtime.loadModel({ model: { id: 'test-model', name: 'Test Model' } })

    expect(status).toMatchObject({
      runtime: 'auto',
      engine: 'wasm',
      selectedBackend: 'cpu'
    })
    await expect(session.chat({ prompt: 'hello' })).resolves.toMatchObject({
      backend: 'cpu',
      text: 'wasm chat ok'
    })
    await expect(session.embed({ text: 'abc' })).resolves.toMatchObject({
      backend: 'cpu',
      vector: [7, 8, 9]
    })
  })

  it('chooses the wasm runtime in a browser-like environment', async() => {
    globalThis.window = {}
    globalThis.document = {}

    const nodeRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu', 'openvino'],
        selectedBackend: 'cpu'
      }),
      loadModel: async() => {
        throw new Error('node runtime should not be selected in browser')
      },
      generateChat: async() => 'node chat ok',
      embedText: async() => [1, 2, 3]
    }
    const wasmRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu', 'gpu'],
        selectedBackend: 'gpu'
      }),
      loadModel: async() => ({
        backend: 'gpu',
        modelLabel: 'wasm-model',
        chat: async() => ({ backend: 'gpu', text: 'wasm chat ok' }),
        complete: async() => ({ backend: 'gpu', text: 'wasm completion ok' }),
        embed: async() => ({ backend: 'gpu', vector: [7, 8, 9] })
      })
    }

    const runtime = new AutoLlamaRuntime({ nodeRuntime, wasmRuntime })
    const status = await runtime.status()
    const session = await runtime.loadModel({ backend: 'auto', modelLabel: 'Wasm Model' })

    expect(status).toMatchObject({
      runtime: 'auto',
      engine: 'wasm',
      selectedBackend: 'cpu'
    })
    await expect(session.chat({ prompt: 'hello' })).resolves.toMatchObject({
      backend: 'gpu',
      text: 'wasm chat ok'
    })
    await expect(session.embed({ text: 'abc' })).resolves.toMatchObject({
      backend: 'gpu',
      vector: [7, 8, 9]
    })
  })

  it('falls back to CPU when TPU is requested but unsupported', async() => {
    const nodeRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu'
      }),
      loadModel: async() => ({ model: { id: 'cpu-model' }, source: 'node' }),
      generateChat: async() => 'node chat ok',
      embedText: async() => [1, 2, 3]
    }
    const wasmRuntime = {
      status: async() => ({
        available: true,
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu'
      }),
      loadModel: async(options) => ({
        backend: options.backend || 'cpu',
        modelLabel: 'fallback-model',
        chat: async() => ({ backend: options.backend || 'cpu', text: 'fallback chat ok', fallbackNotice: 'Backend tpu is not supported in this environment; falling back to CPU.' }),
        complete: async() => ({ backend: options.backend || 'cpu', text: 'fallback completion ok', fallbackNotice: 'Backend tpu is not supported in this environment; falling back to CPU.' }),
        embed: async() => ({ backend: options.backend || 'cpu', vector: [7, 8, 9], fallbackNotice: 'Backend tpu is not supported in this environment; falling back to CPU.' })
      })
    }

    const runtime = new AutoLlamaRuntime({ nodeRuntime, wasmRuntime })
    const session = await runtime.loadModel({ backend: 'tpu', modelLabel: 'TPU Model' })

    await expect(session.chat({ prompt: 'hello' })).resolves.toMatchObject({
      backend: 'cpu',
      text: 'fallback chat ok',
      fallbackNotice: 'Backend tpu is not supported in this environment; falling back to CPU.'
    })
  })
})
