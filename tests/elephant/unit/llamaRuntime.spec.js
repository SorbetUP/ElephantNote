/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import {
  LLAMA_BACKEND_PRIORITY,
  getMissingLlamaBackends,
  normalizeLlamaBackend,
  selectPreferredLlamaBackend
} from 'common/elephantnote/ai/llamaBackend'
import { WasmLlamaRuntime } from 'common/elephantnote/ai/wasmLlamaRuntime'

describe('llama backend selection', () => {
  it('normalizes common backend aliases', () => {
    expect(normalizeLlamaBackend('wasm')).toBe('cpu')
    expect(normalizeLlamaBackend('WebGPU')).toBe('gpu')
    expect(normalizeLlamaBackend('metal')).toBe('mpu')
    expect(normalizeLlamaBackend('npu')).toBe('npu')
  })

  it('selects the first available backend in the declared priority order', () => {
    expect(selectPreferredLlamaBackend({
      availableBackends: ['gpu', 'openvino', 'cpu'],
      preferredOrder: LLAMA_BACKEND_PRIORITY
    })).toBe('cpu')
  })

  it('reports the missing backends in priority order', () => {
    expect(getMissingLlamaBackends({
      availableBackends: ['cpu', 'gpu']
    })).toEqual(['mpu', 'npu', 'openvino'])
  })
})

describe('WasmLlamaRuntime', () => {
  it('reports a CPU-only fallback when WebGPU is unavailable', async() => {
    const runtime = new WasmLlamaRuntime({
      moduleLoader: async() => ({ Wllama: class FakeWllama {} }),
      preferredBackends: ['cpu', 'gpu', 'mpu', 'npu', 'openvino']
    })

    const status = await runtime.status()
    expect(status).toMatchObject({
      runtime: 'wasm',
      engine: 'wllama',
      available: true,
      selectedBackend: 'cpu'
    })
  })

  it('loads local files through the injected Wllama module and runs chat completion', async() => {
    const calls = []
    class FakeWllama {
      constructor(configPaths, options) {
        calls.push({ type: 'constructor', configPaths, options })
      }

      setCompat(value) {
        calls.push({ type: 'setCompat', value })
      }

      async loadModel(files, options) {
        calls.push({
          type: 'loadModel',
          files: files.map((file) => file.name),
          options
        })
      }

      async createChatCompletion(payload) {
        calls.push({ type: 'createChatCompletion', payload })
        return {
          choices: [
            {
              message: {
                content: 'local inference ok'
              }
            }
          ]
        }
      }
    }

    const runtime = new WasmLlamaRuntime({
      configPaths: { default: '/tmp/wllama.wasm' },
      moduleLoader: async() => ({ Wllama: FakeWllama }),
      preferredBackends: ['cpu']
    })

    const session = await runtime.loadModel({
      files: [
        {
          name: 'tiny.gguf'
        }
      ],
      modelLabel: 'Tiny local model'
    })

    const result = await session.chat({
      messages: [{ role: 'user', content: 'Say hello' }],
      maxTokens: 16,
      temperature: 0
    })

    expect(result).toMatchObject({
      backend: 'cpu',
      modelLabel: 'Tiny local model',
      text: 'local inference ok'
    })
    expect(calls).toEqual([
      {
        type: 'constructor',
        configPaths: { default: '/tmp/wllama.wasm' },
        options: {}
      },
      {
        type: 'setCompat',
        value: 'default'
      },
      {
        type: 'loadModel',
        files: ['tiny.gguf'],
        options: { n_gpu_layers: 0 }
      },
      {
        type: 'createChatCompletion',
        payload: {
          messages: [{ role: 'user', content: 'Say hello' }],
          max_tokens: 16,
          temperature: 0,
          top_k: 40,
          top_p: 0.9,
          stream: false,
          onData: null
        }
      }
    ])
  })
})
