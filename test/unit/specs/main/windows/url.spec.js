import { describe, expect, it } from 'vitest'
import { buildRendererBaseUrl } from 'main_renderer/windows/url'

describe('renderer url selection', () => {
  it('uses the dev server url when dev mode is active', () => {
    expect(buildRendererBaseUrl({
      isDevMode: true,
      rendererUrl: 'http://localhost:5173'
    })).toBe('http://localhost:5173')
  })

  it('falls back to the packaged renderer when dev mode is unavailable', () => {
    expect(buildRendererBaseUrl({
      isDevMode: false,
      rendererUrl: 'http://localhost:5173',
      fallbackUrl: 'file:///app/renderer/index.html'
    })).toBe('file:///app/renderer/index.html')
  })
})
