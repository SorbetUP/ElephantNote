/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createConsoleMirror, formatLogArgs } from '../../../../Elephant/frontend/src/common/logging.js'

describe('logging bridge helpers', () => {
  it('formats structured values into a terminal-safe line', () => {
    expect(formatLogArgs([
      'hello',
      { value: 1 },
      new Error('boom')
    ])).toContain('hello')
  })

  it('mirrors console calls to the provided sink', () => {
    const emit = vi.fn()
    const mirror = createConsoleMirror({ emit, enabled: true })

    mirror.warn('warning', { id: 1 })

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      message: expect.stringContaining('warning'),
      args: expect.arrayContaining(['warning'])
    }))
  })
})
