/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { serializeIpcValue } from '../../back/app/ipc/modelLibraryIpc.js'

describe('modelLibrary IPC serialization', () => {
  it('produces a structured-clone safe payload for model responses', () => {
    const payload = {
      provider: 'node-llama-cpp',
      available: true,
      runtime: {
        kind: 'NodeLlamaCppRuntime',
        loadModel: () => ({})
      },
      models: [
        {
          id: 'local.gguf',
          path: '/tmp/local.gguf',
          loaded: { unload: () => {} },
          manifest: {
            installedAt: '2026-06-19T12:00:00.000Z',
            nested: new Map([['key', 'value']])
          }
        }
      ]
    }
    payload.self = payload

    const serialized = serializeIpcValue(payload)

    expect(() => structuredClone(serialized)).not.toThrow()
    expect(serialized).toMatchObject({
      provider: 'node-llama-cpp',
      available: true,
      models: [
        {
          id: 'local.gguf',
          path: '/tmp/local.gguf',
          manifest: {
            installedAt: '2026-06-19T12:00:00.000Z',
            nested: {
              key: 'value'
            }
          }
        }
      ]
    })
    expect(serialized.runtime).toBeUndefined()
    expect(serialized.models[0].loaded).toBeUndefined()
    expect(serialized.self).toBeUndefined()
  })
})
