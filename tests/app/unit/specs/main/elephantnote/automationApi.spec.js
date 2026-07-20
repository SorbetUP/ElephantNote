import { describe, expect, it } from 'vitest'
import { enhanceAutomationApi } from '../../../../../../Elephant/frontend/src/renderer/src/platform/automationBridgeEnhancements'
import { ElephantAutomationClient } from '../../../../../../build/scripts/elephant-automation-client.mjs'

const visible = (element, rect = { x: 10, y: 20, width: 120, height: 40 }) => {
  element.getClientRects = () => [rect]
  element.getBoundingClientRect = () => rect
  return element
}

describe('Elephant Automation API', () => {
  it('creates bounded semantic snapshots and direct UI assertions', () => {
    document.body.innerHTML = '<main aria-label="Workspace"><button aria-label="Settings">Open</button><div role="alert">Ready</div></main>'
    for (const element of document.querySelectorAll('*')) visible(element)
    const target = {
      document,
      location: { href: 'tauri://localhost/' },
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 2,
      getComputedStyle: window.getComputedStyle.bind(window)
    }
    const api = enhanceAutomationApi({ target, api: {} })
    const snapshot = api.uiSnapshot('main')

    expect(snapshot.root.exists).toBe(true)
    expect(snapshot.root.visible).toBe(true)
    expect(snapshot.elements.some((entry) => entry.name === 'Settings')).toBe(true)
    expect(snapshot.viewport).toEqual({ width: 1280, height: 720, devicePixelRatio: 2 })
    expect(api.assertUi({ selector: '[role="alert"]', textIncludes: 'Ready', visible: true }).ok).toBe(true)
    expect(() => api.assertUi({ selector: '[role="alert"]', textIncludes: 'Missing' })).toThrow(/UI assertion failed/)
  })

  it('filters structured logs and can assert that errors are absent', () => {
    const target = {
      document,
      getComputedStyle: window.getComputedStyle.bind(window),
      __ELEPHANT_DEBUG_LOGS__: [
        { level: 'info', event: 'startup', message: 'ready' },
        { level: 'error', event: 'addon', message: 'failed to load' },
        { level: 'warn', event: 'network', message: 'retry' }
      ]
    }
    const api = enhanceAutomationApi({ target, api: {} })

    expect(api.logs({ level: 'error' })).toHaveLength(1)
    expect(api.logs({ contains: 'retry' })[0].event).toBe('network')
    expect(api.assertLogs({ level: 'error', minCount: 1, maxCount: 1 }).ok).toBe(true)
    expect(() => api.assertLogs({ level: 'error', minCount: 0, maxCount: 0 })).toThrow(/Log assertion failed/)
    expect(api.clearLogs().cleared).toBe(3)
  })

  it('authenticates client calls and preserves command arguments', async() => {
    const calls = []
    const fetchImpl = async(url, options = {}) => {
      calls.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async() => ({ ok: true, result: { done: true } })
      }
    }
    const client = new ElephantAutomationClient({
      endpoint: 'http://127.0.0.1:43127/',
      token: 'secret',
      fetchImpl
    })

    await client.command('click', '.target')
    expect(calls[0].url).toBe('http://127.0.0.1:43127/v1/command')
    expect(calls[0].options.headers.authorization).toBe('Bearer secret')
    expect(JSON.parse(calls[0].options.body)).toEqual({ command: 'click', args: ['.target'] })
  })
})
