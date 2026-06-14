/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { ModelRuntime } from 'main_renderer/elephantnote/modelRuntime'

describe('ModelRuntime', () => {
  it('reports node-llama-cpp runtime availability by default', async() => {
    const runtime = new ModelRuntime({
      nodeLlamaCppRuntime: {
        status: async() => ({
          provider: 'node-llama-cpp',
          available: true,
          models: [{ id: 'local.gguf' }]
        })
      }
    })

    await expect(runtime.listLocalModels()).resolves.toMatchObject({
      provider: 'node-llama-cpp',
      available: true,
      models: [{ id: 'local.gguf' }]
    })
  })

  it('downloads node-llama-cpp models through the local runtime', async() => {
    const runtime = new ModelRuntime({
      nodeLlamaCppRuntime: {
        downloadModel: async(model) => ({
          id: model.id,
          provider: 'node-llama-cpp',
          downloaded: true,
          modelPath: '/tmp/local.gguf'
        })
      }
    })

    await expect(runtime.downloadModel({
      id: 'smollm2-node-llama-cpp-chat',
      name: 'SmolLM2 135M GGUF Chat',
      provider: 'node-llama-cpp'
    })).resolves.toMatchObject({
      downloaded: true,
      provider: 'node-llama-cpp',
      modelPath: '/tmp/local.gguf'
    })
  })

  it('keeps external downloads manual', async() => {
    const runtime = new ModelRuntime()

    await expect(runtime.downloadModel({
      id: 'codex-compatible',
      name: 'Codex-compatible Agent',
      provider: 'openai-compatible'
    })).resolves.toMatchObject({
      downloaded: false,
      provider: 'openai-compatible'
    })
  })

  it('lists Ollama models through the local tags API', async() => {
    const runtime = new ModelRuntime({
      fetchImpl: async(url) => ({
        ok: true,
        status: 200,
        text: async() => JSON.stringify({
          models: [
            {
              name: 'nomic-embed-text:latest',
              size: 274000000,
              modified_at: '2026-06-14T00:00:00Z',
              digest: 'abc'
            }
          ]
        }),
        url
      })
    })

    await expect(runtime.listLocalModels({
      provider: 'ollama',
      endpoint: '127.0.0.1:11434/api/chat'
    })).resolves.toMatchObject({
      provider: 'ollama',
      available: true,
      endpoint: 'http://127.0.0.1:11434',
      models: [
        {
          id: 'nomic-embed-text:latest',
          provider: 'ollama'
        }
      ]
    })
  })

  it('pulls Ollama models through the local pull API', async() => {
    const requests = []
    const runtime = new ModelRuntime({
      fetchImpl: async(url, options) => {
        requests.push({ url, options })
        return {
          ok: true,
          status: 200,
          text: async() => JSON.stringify({ status: 'success' })
        }
      }
    })

    await expect(runtime.downloadModel({
      id: 'nomic-embed-text',
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434'
    })).resolves.toMatchObject({
      downloaded: true,
      provider: 'ollama'
    })
    expect(requests[0].url).toBe('http://127.0.0.1:11434/api/pull')
    expect(JSON.parse(requests[0].options.body)).toMatchObject({
      name: 'nomic-embed-text',
      stream: false
    })
  })

  it('extracts image text through the OCR runtime', async() => {
    const runtime = new ModelRuntime({
      ocrRuntime: {
        extractImageText: async(payload) => ({
          provider: 'local-ocr',
          engine: 'tesseract',
          imagePath: payload.imagePath,
          text: 'ElephantNote Settings'
        })
      }
    })

    await expect(runtime.extractImageText({
      imagePath: '/tmp/settings.png',
      language: 'eng'
    })).resolves.toMatchObject({
      provider: 'local-ocr',
      engine: 'tesseract',
      imagePath: '/tmp/settings.png',
      text: 'ElephantNote Settings'
    })
  })
})
