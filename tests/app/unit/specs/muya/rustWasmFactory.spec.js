import { describe, expect, it } from 'vitest'

import { createBundledMuyaRustEngine } from '../../../../../Elephant/frontend/src/muya/lib/rust/wasmFactory'

describe('createBundledMuyaRustEngine', () => {
  it('fails explicitly when the normal build resolves the disabled bundle', async () => {
    await expect(createBundledMuyaRustEngine('alpha')).rejects.toThrow(
      'The bundled Muya Rust editor is disabled'
    )
  })
})
