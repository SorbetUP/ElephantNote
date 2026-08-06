import { describe, expect, it } from 'vitest'
import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'

describe('public ElephantNote client surface', () => {
  it('exposes all canonical high-level domains', () => {
    for (const domain of [
      'vaults',
      'notes',
      'calendar',
      'search',
      'models',
      'atomicFeatures',
      'markdown',
      'editorEngine',
      'sync',
      'plugins',
      'tasks',
      'mcp',
      'programs'
    ]) {
      expect(elephantnoteClient[domain], `${domain} domain`).toBeTruthy()
    }
  })

  it('keeps muya only as a compatibility alias of editorEngine', () => {
    expect(elephantnoteClient.muya).toBe(elephantnoteClient.editorEngine)
  })

  it('exposes one call and one subscription transport', () => {
    expect(typeof elephantnoteClient.call).toBe('function')
    expect(typeof elephantnoteClient.subscribe).toBe('function')
    expect(typeof elephantnoteClient.describe).toBe('function')
  })
})
