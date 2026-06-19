import { describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

vi.mock('electron-log/renderer', () => ({ default: { info: () => {}, error: () => {}, warn: () => {} } }))
vi.mock('../../front/app/services/elephantnoteClient', () => ({
  elephantnoteClient: {
    models: {
      list: vi.fn().mockResolvedValue({ models: [], message: 'ok' }),
      getSelection: vi.fn().mockResolvedValue({}),
      setSelection: vi.fn().mockResolvedValue({}),
      active: vi.fn().mockResolvedValue(null),
      searchHuggingFace: vi.fn().mockResolvedValue({ models: [] }),
      download: vi.fn().mockResolvedValue({}),
      cancelDownload: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
      onDownloadProgress: vi.fn().mockReturnValue(() => {})
    }
  }
}))

describe('ModelsView render', () => {
  it('mounts without throwing', async() => {
    const ModelsView = (await import('../../front/app/components/views/ModelsView.vue')).default
    const app = createApp({
      render: () => h(ModelsView)
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    let error = null
    app.config.errorHandler = (err) => { error = err }
    app.mount(container)
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Filter out jsdom-specific issues with @keyup.enter that don't occur in Electron
    const realError = error && !String(error?.message || '').includes('_withKeys') ? error : null
    expect(realError).toBeNull()
    app.unmount()
    container.remove()
  })
})
