/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { ModelRuntime } from 'main_renderer/elephantnote/modelRuntime'

describe('ModelRuntime', () => {
  it('parses local Ollama models', async() => {
    const runtime = new ModelRuntime({
      executor: vi.fn(async() => ({
        stdout: 'NAME            ID              SIZE      MODIFIED\nllama3.2:latest  abc123          2.0 GB    1 hour ago\n'
      }))
    })

    await expect(runtime.listLocalModels()).resolves.toMatchObject({
      available: true,
      models: [
        {
          name: 'llama3.2:latest',
          id: 'abc123',
          size: '2.0 GB'
        }
      ]
    })
  })

  it('reports non-Ollama model downloads as manual', async() => {
    const runtime = new ModelRuntime()

    await expect(runtime.downloadModel({
      id: 'bge-m3',
      name: 'BGE-M3',
      provider: 'local'
    })).resolves.toMatchObject({
      downloaded: false,
      provider: 'local'
    })
  })
})
