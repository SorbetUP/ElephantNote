import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { createProgrammaticChangeGuard } from '../../../Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const wrapperPath = path.join(
  root,
  'Elephant/frontend/src/renderer/src/muya/completeMuyaRustAdapter.js.wrapper.js'
)

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

  it('never reparses exported Markdown in a fixed-point loop', () => {
    const wrapper = fs.readFileSync(wrapperPath, 'utf8')

    expect(wrapper).not.toContain('stabilizeProgrammaticMarkdown')
    expect(wrapper).not.toMatch(/while\s*\(/)
    expect(wrapper).not.toContain('maxPasses')
    expect(wrapper).toContain('Reading once after the synchronous Muya render is sufficient')
  })

  it('keeps the rendered cursor as metadata instead of reinserting it repeatedly', () => {
    const wrapper = fs.readFileSync(wrapperPath, 'utf8')
    const renderMethod = wrapper.slice(
      wrapper.indexOf('__renderCanonicalMarkdown'),
      wrapper.indexOf('\n  setMarkdown', wrapper.indexOf('__renderCanonicalMarkdown'))
    )

    expect(renderMethod.match(/__setProgrammaticMarkdown/g)).toHaveLength(1)
    expect(renderMethod.match(/getMuyaIndexCursor/g)).toHaveLength(1)
    expect(renderMethod).not.toContain('for (')
  })
})
