/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import {
  NodeLlamaCppRuntime,
  createLlamaLogger,
  shouldSuppressLlamaLog
} from '../../back/app/runtime/nodeLlamaCppRuntime.js'

describe('NodeLlamaCppRuntime', () => {
  it('reports the available backends in priority order from module capabilities', async() => {
    const getLlama = vi.fn(async() => ({ gpu: 'cuda' }))
    const runtime = new NodeLlamaCppRuntime({
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => ['cuda', 'metal'],
        getModuleVersion: () => 'test-version',
        getLlama
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      provider: 'node-llama-cpp',
      available: true,
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'gpu', 'mpu']
    })
    expect(getLlama).not.toHaveBeenCalled()
  })

  it('enables OpenVINO in the backend report when build options request it', async() => {
    const getLlama = vi.fn(async() => ({ gpu: 'openvino' }))
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        cmakeOptions: {
          GGML_OPENVINO: 'ON'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'openvino']
    })
    expect(getLlama).not.toHaveBeenCalled()
  })

  it('reports NPU separately when OpenVINO is configured for NPU execution', async() => {
    const getLlama = vi.fn(async() => ({ gpu: 'openvino-npu' }))
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        openvinoDevice: 'NPU',
        cmakeOptions: {
          GGML_OPENVINO: 'ON',
          GGML_OPENVINO_DEVICE: 'NPU'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama
      })
    })

    const status = await runtime.status()

    expect(status).toMatchObject({
      selectedBackend: 'cpu',
      supportedBackends: ['cpu', 'npu', 'openvino']
    })
    expect(getLlama).not.toHaveBeenCalled()
  })

  it('defaults llama logging to warn while passing through explicit options', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        build: 'auto',
        cmakeOptions: {
          GGML_OPENVINO: 'ON'
        }
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => ['cuda'],
        getLlama: async(options) => {
          calls.push(options)
          return {
            loadModel: async(payload) => {
              calls.push(payload)
              return { id: 'loaded-model' }
            }
          }
        }
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'

    const result = await runtime.loadModel({
      id: 'model',
      path: '/tmp/model.gguf',
      backend: 'cpu'
    })

    expect(result).toMatchObject({
      modelPath: '/tmp/model.gguf'
    })
    expect(calls[0]).toMatchObject({
      logLevel: 'warn',
      build: 'auto',
      cmakeOptions: {
        GGML_OPENVINO: 'ON'
      },
      logger: {
        log: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
        error: expect.any(Function)
      }
    })
    expect(calls[1]).toEqual({
      modelPath: '/tmp/model.gguf',
      contextSize: 8192,
      gpuLayers: 0
    })
  })

  it('raises undersized load contexts before the native model is created', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama: async(options) => {
          calls.push(options)
          return {
            loadModel: async(payload) => {
              calls.push(payload)
              return { id: 'loaded-model' }
            }
          }
        }
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'

    await runtime.loadModel({
      id: 'model',
      path: '/tmp/model.gguf',
      contextSize: 512,
      embeddingContextSize: 512
    })

    expect(calls[1]).toEqual({
      modelPath: '/tmp/model.gguf',
      contextSize: 8192,
      gpuLayers: 'auto'
    })
  })

  it('keeps an explicit llama log level override', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      llamaOptions: {
        logLevel: 'error',
        build: 'auto'
      },
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        getLlama: async(options) => {
          calls.push(options)
          return {
            loadModel: async(payload) => {
              calls.push(payload)
              return { id: 'loaded-model' }
            }
          }
        }
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'

    await runtime.loadModel({
      id: 'model',
      path: '/tmp/model.gguf'
    })

    expect(calls[0]).toMatchObject({
      logLevel: 'error',
      build: 'auto'
    })
  })

  it('uses the model train context size when generating chat and embeddings', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        LlamaChatSession: class {
          constructor() {}

          async prompt() {
            return 'ok'
          }
        },
        getLlama: async() => ({
          loadModel: async() => ({
            trainContextSize: 8192,
            path: '/tmp/model.gguf',
            createContext: async(options) => {
              calls.push({ type: 'createContext', options })
              return {
                getSequence: () => ({}),
                dispose: async() => {}
              }
            },
            createEmbeddingContext: async(options) => {
              calls.push({ type: 'createEmbeddingContext', options })
              return {
                getEmbeddingFor: async() => ({ vector: [1, 2, 3] }),
                dispose: async() => {}
              }
            }
          })
        })
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'
    await runtime.generateChat({
      model: { id: 'chat-model', path: '/tmp/model.gguf' },
      prompt: 'hello'
    })
    await runtime.embedText({
      model: { id: 'embed-model', path: '/tmp/model.gguf' },
      text: 'hello'
    })

    expect(calls).toEqual([
      {
        type: 'createContext',
        options: { contextSize: 8192 }
      },
      {
        type: 'createEmbeddingContext',
        options: { contextSize: 8192 }
      }
    ])
  })

  it('expands undersized requested contexts up to the model train size', async() => {
    const calls = []
    const runtime = new NodeLlamaCppRuntime({
      moduleLoader: async() => ({
        getLlamaGpuTypes: async() => [],
        LlamaChatSession: class {
          constructor() {}

          async prompt() {
            return 'ok'
          }
        },
        getLlama: async() => ({
          loadModel: async() => ({
            trainContextSize: 8192,
            path: '/tmp/model.gguf',
            createContext: async(options) => {
              calls.push({ type: 'createContext', options })
              return {
                getSequence: () => ({}),
                dispose: async() => {}
              }
            },
            createEmbeddingContext: async(options) => {
              calls.push({ type: 'createEmbeddingContext', options })
              return {
                getEmbeddingFor: async() => ({ vector: [1, 2, 3] }),
                dispose: async() => {}
              }
            }
          })
        })
      })
    })

    runtime.resolveModel = async() => '/tmp/model.gguf'
    await runtime.generateChat({
      model: {
        id: 'chat-model',
        path: '/tmp/model.gguf',
        contextSize: 512
      },
      prompt: 'hello'
    })
    await runtime.embedText({
      model: {
        id: 'embed-model',
        path: '/tmp/model.gguf',
        contextSize: 512,
        embeddingContextSize: 512
      },
      text: 'hello'
    })

    expect(calls).toEqual([
      {
        type: 'createContext',
        options: { contextSize: 8192 }
      },
      {
        type: 'createEmbeddingContext',
        options: { contextSize: 8192 }
      }
    ])
  })

  it('suppresses the known llama.cpp startup warnings', () => {
    expect(shouldSuppressLlamaLog('llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized')).toBe(true)
    expect(shouldSuppressLlamaLog('init: embeddings required but some input tokens were not marked as outputs -> overriding')).toBe(true)
    expect(shouldSuppressLlamaLog('llama_context: something else entirely')).toBe(false)
  })

  it('routes non-benign llama logs through the provided logger', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    const llamaLogger = createLlamaLogger(logger)

    llamaLogger.warn('llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized')
    llamaLogger.info('node-llama-cpp model ready')
    llamaLogger.error('fatal runtime error')

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('node-llama-cpp model ready')
    expect(logger.error).toHaveBeenCalledWith('fatal runtime error')
  })
})
