/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { ModelRuntime } from 'main_renderer/elephantnote/modelRuntime'

describe('ModelRuntime', () => {
  it('reports browser runtime availability without probing Ollama', async() => {
    const runtime = new ModelRuntime()

    await expect(runtime.listLocalModels()).resolves.toMatchObject({
      provider: 'browser',
      available: true,
      models: []
    })
  })

  it('treats browser model downloads as renderer-managed metadata', async() => {
    const runtime = new ModelRuntime()

    await expect(runtime.downloadModel({
      id: 'qwen25-05b-chat-browser',
      name: 'Qwen2.5 0.5B Browser Chat',
      provider: 'browser'
    })).resolves.toMatchObject({
      downloaded: false,
      provider: 'browser'
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
})
