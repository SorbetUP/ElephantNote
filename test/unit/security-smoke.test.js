import { describe, expect, it } from 'vitest'

describe('security smoke', () => {
  it('keeps basic assertions wired', () => {
    expect(1 + 1).toBe(2)
  })
})
