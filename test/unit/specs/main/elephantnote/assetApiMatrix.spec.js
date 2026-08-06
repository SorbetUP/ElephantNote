import { describe, expect, it, vi } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  validateApiPayload
} from 'common/elephantnote/apiContractsV2'
import { createAssetClients } from 'elephant-front/services/elephantnoteClient/assetClients'
import { createPlatformCompatibilityAdapter } from 'elephant-front/services/elephantnoteClient/platformCompatibilityAdapter'

const scene = {
  type: 'excalidraw',
  version: 2,
  elements: [],
  files: {}
}

const CLIENT_CASES = [
  ['attachments.list', [], API.ATTACHMENTS_LIST, {}],
  ['attachments.writeText', ['imports/readme.txt', 'hello'], API.ATTACHMENTS_WRITE_TEXT, {
    relativePath: 'imports/readme.txt',
    content: 'hello'
  }],
  ['drawings.list', [], API.DRAWINGS_LIST, {}],
  ['drawings.create', ['Architecture'], API.DRAWINGS_CREATE, { title: 'Architecture' }],
  ['drawings.read', ['.assets/Architecture.excalidraw'], API.DRAWINGS_READ, {
    relativePath: '.assets/Architecture.excalidraw'
  }],
  ['drawings.write', ['.assets/Architecture.excalidraw', scene], API.DRAWINGS_WRITE, {
    relativePath: '.assets/Architecture.excalidraw',
    scene
  }]
]

const resolveMethod = (client, path) =>
  path.split('.').reduce((value, key) => value?.[key], client)

describe('attachment and drawing API matrix', () => {
  it.each(CLIENT_CASES)('%s dispatches its canonical action', async(path, args, action, payload) => {
    const call = vi.fn(async() => ({}))
    const client = createAssetClients(call)
    await resolveMethod(client, path)(...args)
    expect(call).toHaveBeenCalledWith(action, payload)
    expect(validateApiPayload(action, payload)).toEqual(payload)
  })

  it.each([
    [API.ATTACHMENTS_LIST, 'attachments', 'list', {}],
    [API.ATTACHMENTS_WRITE_TEXT, 'attachments', 'writeText', {
      relativePath: 'imports/readme.txt', content: 'hello'
    }],
    [API.DRAWINGS_LIST, 'drawings', 'list', {}],
    [API.DRAWINGS_CREATE, 'drawings', 'create', { title: 'Architecture' }],
    [API.DRAWINGS_READ, 'drawings', 'read', {
      relativePath: '.assets/Architecture.excalidraw'
    }],
    [API.DRAWINGS_WRITE, 'drawings', 'write', {
      relativePath: '.assets/Architecture.excalidraw', scene
    }]
  ])('routes %s to %s.%s', async(action, namespace, methodName, payload) => {
    const method = vi.fn(async(value) => value ?? [])
    const adapter = createPlatformCompatibilityAdapter({
      elephantnote: { [namespace]: { [methodName]: method } }
    })

    await adapter.call(action, payload)
    if (action === API.ATTACHMENTS_LIST || action === API.DRAWINGS_LIST) {
      expect(method).toHaveBeenCalledWith()
    } else {
      expect(method).toHaveBeenCalledWith(payload)
    }
  })

  it('rejects incomplete asset payloads before platform transport', () => {
    expect(() => validateApiPayload(API.ATTACHMENTS_WRITE_TEXT, {
      content: 'missing path'
    })).toThrow(/relativePath/i)
    expect(() => validateApiPayload(API.DRAWINGS_READ, {})).toThrow(/relativePath/i)
    expect(() => validateApiPayload(API.DRAWINGS_WRITE, {
      relativePath: '.assets/A.excalidraw',
      scene: null
    })).toThrow(/scene/i)
  })

  it('serializes proxied drawing scenes into plain payloads', async() => {
    const call = vi.fn(async() => ({}))
    const client = createAssetClients(call)
    const proxiedScene = new Proxy(scene, {})

    await client.drawings.write('.assets/A.excalidraw', proxiedScene)
    expect(call).toHaveBeenCalledWith(API.DRAWINGS_WRITE, {
      relativePath: '.assets/A.excalidraw',
      scene
    })
  })
})
