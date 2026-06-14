import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipeline = vi.fn()

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

    const status = await runtime.getBrowserModelRuntimeStatus()

    expect(status).toMatchObject({
      runtime: 'browser',
      webcpuAvailable: true,
      transformersAvailable: true
    })
  })

  it('loads and tests an embedding model through the feature-extraction pipeline', async() => {
    pipeline.mockResolvedValue(async() => ({ data: new Float32Array([0.1, 0.2, 0.3]) }))
    const runtime = await import('elephant-front/services/browserModelRuntime')
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
      device: 'cpu',
      dtype: 'q8'
    }))
    expect(loaded).toMatchObject({ id: 'minilm-embedding-browser', device: 'cpu', task: 'feature-extraction' })
    expect(test).toMatchObject({ ok: true, runtime: 'browser', dimensions: 3 })
    expect(runtime.listBrowserModels()).toEqual([expect.objectContaining({
      id: 'minilm-embedding-browser',
      browserModel: 'Xenova/all-MiniLM-L6-v2'
    })])
  })

  it('loads and tests a chat model through the text-generation pipeline', async() => {
    pipeline.mockResolvedValue(async() => [{ generated_text: [{ role: 'assistant', content: 'ElephantNote browser model test OK.' }] }])
    const runtime = await import('elephant-front/services/browserModelRuntime')
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
      device: 'cpu',
      dtype: 'q4'
    }))
    expect(loaded).toMatchObject({ id: 'qwen25-05b-chat-browser', device: 'cpu', task: 'text-generation' })
    expect(test).toMatchObject({ ok: true, runtime: 'browser', response: 'ElephantNote browser model test OK.' })
  })
    it('falls back from WebGPU to WebCPU when automatic browser loading fails on WebGPU', async() => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {}
    })
    pipeline
      .mockRejectedValueOnce(new Error('WebGPU adapter failed'))
      .mockResolvedValueOnce(async() => [{ generated_text: [{ role: 'assistant', content: 'fallback OK' }] }])
    const runtime = await import('elephant-front/services/browserModelRuntime')
    const model = {
      id: 'qwen25-05b-chat-browser',
      name: 'Qwen2.5 0.5B Browser Chat',
      task: 'text-generation',
      browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
      dtype: 'q4'
    }

    const loaded = await runtime.loadBrowserTextModel(model, { backend: 'auto' })

    expect(pipeline).toHaveBeenNthCalledWith(1, 'text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', expect.objectContaining({
      device: 'webgpu'
    }))
    expect(pipeline).toHaveBeenNthCalledWith(2, 'text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', expect.objectContaining({
      device: 'cpu'
    }))
    expect(loaded).toMatchObject({ device: 'cpu', loaded: true })
  })
})
