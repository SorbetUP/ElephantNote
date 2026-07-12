import { describe, expect, it, vi } from 'vitest'

import { createProgrammaticChangeGuard } from '../../../Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js'
import { stabilizeProgrammaticMarkdown } from '../../../Elephant/frontend/src/renderer/src/muya/rustMarkdownStabilizer.js'

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

  it('round-trips malformed loaded Markdown until Muya reaches a fixed point', () => {
    const raw = 'x'.repeat(786)
    const firstCanonical = 'y'.repeat(649)
    const stableCanonical = 'z'.repeat(647)
    let renderedMarkdown = ''
    const render = vi.fn((markdown) => {
      renderedMarkdown = markdown
    })
    const readMarkdown = vi.fn(() => {
      if (renderedMarkdown === raw) return firstCanonical
      if (renderedMarkdown === firstCanonical) return stableCanonical
      return stableCanonical
    })
    const readMuyaIndexCursor = vi.fn(() => ({
      anchor: { line: 0, ch: renderedMarkdown.length },
      focus: { line: 0, ch: renderedMarkdown.length }
    }))

    const result = stabilizeProgrammaticMarkdown({
      markdown: raw,
      render,
      readMarkdown,
      readMuyaIndexCursor
    })

    expect(result.stable).toBe(true)
    expect(result.markdown).toBe(stableCanonical)
    expect(result.passes).toBe(3)
    expect(render.mock.calls.map(([markdown]) => markdown.length)).toEqual([786, 649, 647])
    expect(result.muyaIndexCursor.anchor.ch).toBe(647)
  })

  it('stops a non-converging Muya round trip without looping forever', () => {
    let renderedMarkdown = ''
    const render = vi.fn((markdown) => {
      renderedMarkdown = markdown
    })
    const readMarkdown = () => renderedMarkdown === 'alpha' ? 'beta' : 'alpha'

    const result = stabilizeProgrammaticMarkdown({
      markdown: 'alpha',
      render,
      readMarkdown,
      maxPasses: 8
    })

    expect(result.stable).toBe(false)
    expect(result.cycle).toBe(true)
    expect(result.passes).toBe(2)
    expect(render).toHaveBeenCalledTimes(2)
  })
})
