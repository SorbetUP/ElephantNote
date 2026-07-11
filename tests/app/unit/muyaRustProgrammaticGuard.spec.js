import { describe, expect, it } from 'vitest'
import { createProgrammaticChangeGuard } from '../../../Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js'

describe('Muya Rust programmatic change guard', () => {
  it('accepts repeated changes emitted by one programmatic render', () => {
    let now = 1000
    const guard = createProgrammaticChangeGuard({ now: () => now, burst: 3, ttlMs: 50 })
    guard.run(() => 'rendered')
    expect(guard.consume()).toBe(true)
    expect(guard.consume()).toBe(true)
    now += 25
    expect(guard.consume()).toBe(true)
  })

  it('expires the programmatic window before later user mutations', () => {
    let now = 1000
    const guard = createProgrammaticChangeGuard({ now: () => now, burst: 1, ttlMs: 50 })
    guard.run(() => null)
    now += 51
    expect(guard.pending).toBe(false)
    expect(guard.consume()).toBe(false)
  })

  it('clears immediately when the guarded render throws', () => {
    const guard = createProgrammaticChangeGuard({ now: () => 1000, burst: 3, ttlMs: 50 })
    expect(() => guard.run(() => { throw new Error('render failed') })).toThrow('render failed')
    expect(guard.pending).toBe(false)
    expect(guard.consume()).toBe(false)
  })
})
