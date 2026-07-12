import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { createRustAsyncMutationGate } from '../../../Elephant/frontend/src/renderer/src/muya/rustAsyncMutationGate.js'
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

describe('Muya Rust asynchronous mutation gate', () => {
  it('suppresses the stale synchronous Muya dispatch until Rust and rendering finish', async() => {
    const dispatch = vi.fn((value) => value)
    let release
    const gate = createRustAsyncMutationGate({ dispatch })
    const operation = gate.enqueue(() => new Promise((resolve) => { release = resolve }))

    expect(gate.pending).toBe(1)
    expect(gate.dispatch('stale')).toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()

    release('done')
    await expect(operation).resolves.toBe('done')

    expect(gate.pending).toBe(0)
    expect(gate.dispatch('fresh')).toBe('fresh')
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('runs rapid editor commands strictly in order', async() => {
    const order = []
    let releaseFirst
    const gate = createRustAsyncMutationGate({ dispatch: vi.fn() })
    const first = gate.enqueue(async() => {
      order.push('first:start')
      await new Promise((resolve) => { releaseFirst = resolve })
      order.push('first:end')
    })
    const second = gate.enqueue(async() => {
      order.push('second:start')
      order.push('second:end')
    })

    await vi.waitFor(() => expect(order).toEqual(['first:start']))
    expect(gate.pending).toBe(2)
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
    expect(gate.pending).toBe(0)
  })

  it('does not let one rejected command poison later commands', async() => {
    const gate = createRustAsyncMutationGate({ dispatch: vi.fn() })
    const failed = gate.enqueue(async() => { throw new Error('broken command') })
    const recovered = gate.enqueue(async() => 'recovered')

    await expect(failed).rejects.toThrow('broken command')
    await expect(recovered).resolves.toBe('recovered')
    expect(gate.pending).toBe(0)
  })
})
