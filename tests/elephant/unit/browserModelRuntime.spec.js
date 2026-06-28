import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipeline = vi.fn()
const TEST_TIMEOUT_MS = 60_000

vi.mock('electron-log/renderer', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@huggingface/transformers', () => ({ pipeline }))

describe('Browser model runtime', () => {
  beforeEach(() => {
    vi.resetModules()
    pipeline.mockReset()
    window.localStorage.clear()
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: undefined
    })
  })

  it('reports a usable WebCPU runtime when Transformers.js can be imported', async() => {
    const runtime = await import('elephant-front/services/browserModelRuntime')
    runtime.setBrowserModelRuntimeDependencies({
      importTransformers: async() => ({}),
      testBrowserNetworkAccess: async() => ({ ok: true, message: 'ok' })
    })

    const status = await runtime.getBrowserModelRuntimeStatus()

    expect(status).toMatchObject({
      runtime: 'browser',
      webcpuAvailable: true,
      transformersAvailable: true
    })
  }, TEST_TIMEOUT_MS)

  it('loads and tests an embedding model through the feature-extraction pipeline', async() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {}
    })
    pipeline.mockResolvedValue(async() => ({ data: new Float32Array([0.1, 0.2, 0.3]) }))
    const runtime = await import('elephant-front/services/browserModelRuntime')
    runtime.setBrowserModelRuntimeDependencies({
      importTransformers: async() => ({ pipeline })
    })
    const model = {
      id: 'minilm-embedding-browser',
      name: 'MiniLM Embeddings Browser',
      task: 'feature-extraction',
      browserModel: 'Xenova/all-MiniLM-L6-v2',
      dtype: 'q8'
    }

    const loaded = await runtime.loadBrowserEmbeddingModel(model)
    const test = await runtime.testBrowserModel(model)

    expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2', expect.objectContaining({
      device: 'webgpu',
      dtype: 'q8'
    }))
    expect(loaded).toMatchObject({ id: 'minilm-embedding-browser', device: 'webgpu', task: 'feature-extraction' })
    expect(test).toMatchObject({ ok: true, runtime: 'browser', dimensions: 3 })
    expect(runtime.listBrowserModels()).toEqual([expect.objectContaining({
      id: 'minilm-embedding-browser',
      browserModel: 'Xenova/all-MiniLM-L6-v2'
    })])
  }, TEST_TIMEOUT_MS)

  it('loads and tests a chat model through the text-generation pipeline', async() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {}
    })
    pipeline.mockResolvedValue(async() => [{ generated_text: [{ role: 'assistant', content: 'ElephantNote browser model test OK.' }] }])
    const runtime = await import('elephant-front/services/browserModelRuntime')
    runtime.setBrowserModelRuntimeDependencies({
      importTransformers: async() => ({ pipeline })
    })
    const model = {
      id: 'qwen25-05b-chat-browser',
      name: 'Qwen2.5 0.5B Browser Chat',
      task: 'text-generation',
      browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
      dtype: 'q4'
    }

    const loaded = await runtime.loadBrowserTextModel(model)
    const test = await runtime.testBrowserModel(model)

    expect(pipeline).toHaveBeenCalledWith('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', expect.objectContaining({
      device: 'webgpu',
      dtype: 'q4'
    }))
    expect(loaded).toMatchObject({ id: 'qwen25-05b-chat-browser', device: 'webgpu', task: 'text-generation' })
    expect(test).toMatchObject({
      ok: true,
      runtime: 'browser',
      response: 'ElephantNote browser model test OK.'
    })
  }, TEST_TIMEOUT_MS)

  it('rejects browser loading when WebGPU is unavailable', async() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: undefined
    })
    const runtime = await import('elephant-front/services/browserModelRuntime')
    runtime.setBrowserModelRuntimeDependencies({
      importTransformers: async() => ({ pipeline })
    })
    await expect(runtime.loadBrowserTextModel({
      id: 'qwen25-05b-chat-browser',
      name: 'Qwen2.5 0.5B Browser Chat',
      task: 'text-generation',
      browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
      dtype: 'q4'
    }, { backend: 'auto' })).rejects.toThrow('Browser AI requires WebGPU')
  }, TEST_TIMEOUT_MS)
})
