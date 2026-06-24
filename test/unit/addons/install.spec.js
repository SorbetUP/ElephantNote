import { describe, expect, it, vi } from 'vitest'
import { installAddonSystem } from '@/addons'

describe('installAddonSystem', () => {
  it('provides the manager through Vue and global properties', () => {
    const app = {
      provide: vi.fn(),
      config: { globalProperties: {} }
    }

    const manager = installAddonSystem(app, { addons: [] })

    expect(app.provide).toHaveBeenCalledOnce()
    expect(app.config.globalProperties.$addons).toBe(manager)
    expect(window.__ELEPHANT_ADDONS__).toBe(manager)
  })

  it('registers supplied addons without enabling disabled addons', () => {
    const app = {
      provide: vi.fn(),
      config: { globalProperties: {} }
    }

    const manager = installAddonSystem(app, {
      addons: [
        {
          manifest: {
            id: 'sample.addon',
            name: 'Sample Addon'
          },
          activate: vi.fn()
        }
      ]
    })

    expect(manager.list()).toHaveLength(1)
    expect(manager.get('sample.addon').enabled).toBe(false)
  })
})
