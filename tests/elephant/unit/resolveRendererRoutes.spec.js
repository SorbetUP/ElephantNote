import { describe, expect, it, vi } from 'vitest'
import { resolveRendererRoutes } from '../../../../Elephant/frontend/src/renderer/src/router/resolveRendererRoutes.js'

describe('resolveRendererRoutes', () => {
  it('calls the router factory and returns route records for vue-router', () => {
    const routeRecords = [{ path: '/editor', component: {} }]
    const routeFactory = vi.fn(() => routeRecords)

    expect(resolveRendererRoutes(routeFactory, 'editor')).toBe(routeRecords)
    expect(routeFactory).toHaveBeenCalledWith('editor')
  })

  it('fails loudly before vue-router receives an invalid routes value', () => {
    expect(() => resolveRendererRoutes(() => undefined, 'editor')).toThrow(
      'Renderer router expected an array of route records.'
    )
  })
})
