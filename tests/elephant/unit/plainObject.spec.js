import { describe, expect, it } from 'vitest'
import { toPlainObject } from '../../shared/plainObject.js'

describe('toPlainObject', () => {
  it('converts proxies and nested objects into clone-safe payloads', () => {
    const payload = new Proxy(
      {
        nested: new Proxy(
          {
            value: 1
          },
          {}
        ),
        list: [1, 2, { ok: true }]
      },
      {}
    )

    const result = toPlainObject(payload)

    expect(result).toEqual({
      nested: { value: 1 },
      list: [1, 2, { ok: true }]
    })
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('handles circular references and errors without throwing', () => {
    const circular = { value: 1 }
    circular.self = circular

    const error = new Error('boom')
    const result = toPlainObject({
      circular,
      error
    })

    expect(result.circular.self).toBe(result.circular)
    expect(result.error).toMatchObject({
      name: 'Error',
      message: 'boom'
    })
    expect(() => structuredClone(result)).not.toThrow()
  })
})
