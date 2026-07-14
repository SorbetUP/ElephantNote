import { describe, expect, it } from 'vitest'

import { createBundledMuyaRustEngine } from '../../../../../Elephant/frontend/src/muya/lib/rust/wasmFactory'

describe('createBundledMuyaRustEngine', () => {
  it('creates the production Rust editor from the generated WASM bundle', async () => {
    const engine = await createBundledMuyaRustEngine('alpha')
    expect(engine).toBeTruthy()
    expect(typeof engine.handle_json).toBe('function')
    expect(typeof engine.snapshot_json).toBe('function')
    const snapshot = JSON.parse(await engine.snapshot_json())
    expect(snapshot.type).toBe('snapshot')
    expect(snapshot.payload.markdown).toBe('alpha')
  })
})
