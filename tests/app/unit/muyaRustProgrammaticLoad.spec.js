import { describe, expect, it, vi } from 'vitest'

import { createProgrammaticChangeGuard } from '../../../Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js'

describe('Muya Rust programmatic render guard', () => {
  it('consumes consecutive deferred loads without hiding the next real mutation', () => {
    const guard = createProgrammaticChangeGuard()
    const render = vi.fn((markdown) => markdown.length)

    expect(guard.run(() => render('old note'))).toBe(8)
    expect(guard.run(() => render('x'.repeat(722)))).toBe(722)
    expect(guard.pending).toBe(2)
    expect(guard.consume()).toBe(true)
    expect(guard.consume()).toBe(true)
    expect(guard.pending).toBe(0)
    expect(guard.consume()).toBe(false)
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('releases its slot when rendering throws', () => {
    const guard = createProgrammaticChangeGuard()
    expect(() => guard.run(() => { throw new Error('render failed') })).toThrow('render failed')
    expect(guard.pending).toBe(0)
    expect(guard.consume()).toBe(false)
  })
})
