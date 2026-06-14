import { describe, expect, it, vi } from 'vitest'
import { SyncthingManager } from 'main_renderer/elephantnote/sync/SyncthingManager'

const jsonResponse = (body = {}, ok = true, status = 200) => ({
  ok,
  status,
  text: async() => JSON.stringify(body)
})

describe('SyncthingManager', () => {
  it('pings the Syncthing REST API with the configured API key', async() => {
    const fetchImpl = vi.fn(async() => jsonResponse({ myID: 'device-1' }))
    const manager = new SyncthingManager({
      endpoint: 'http://127.0.0.1:8384/',
      apiKey: 'secret',
      fetchImpl
    })

    const status = await manager.ping()

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8384/rest/system/status', expect.objectContaining({
      method: 'GET',
      headers: { 'X-API-Key': 'secret' }
    }))
    expect(status).toMatchObject({
      connected: true,
      myID: 'device-1',
      endpoint: 'http://127.0.0.1:8384'
    })
  })

  it('upserts a folder through the Syncthing config API', async() => {
    const fetchImpl = vi.fn(async(url, options) => {
      if (options.method === 'GET' && url.endsWith('/rest/config')) {
        return jsonResponse({ folders: [{ id: 'old', path: '/tmp/old' }] })
      }
      return jsonResponse({})
    })
    const manager = new SyncthingManager({ fetchImpl })

    const folder = await manager.ensureFolder({
      folderId: 'vault-1',
      label: 'Vault',
      path: '/tmp/vault',
      type: 'sendreceive'
    })

    expect(folder).toMatchObject({ id: 'vault-1', path: '/tmp/vault' })
    expect(fetchImpl).toHaveBeenLastCalledWith('http://127.0.0.1:8384/rest/config', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"id":"vault-1"')
    }))
  })

  it('adds a peer device with a LAN address and attaches it to the synced folder', async() => {
    const fetchImpl = vi.fn(async(url, options) => {
      if (options.method === 'GET' && url.endsWith('/rest/config')) {
        return jsonResponse({
          devices: [],
          folders: [{ id: 'vault-1', path: '/tmp/vault', devices: [] }]
        })
      }
      return jsonResponse({})
    })
    const manager = new SyncthingManager({ fetchImpl })

    const peer = await manager.ensurePeer({
      deviceId: 'PEERDEVICE',
      address: 'tcp://192.168.1.42:22000',
      folderId: 'vault-1'
    })

    expect(peer).toEqual({
      deviceId: 'PEERDEVICE',
      name: 'PEERDEVICE',
      address: 'tcp://192.168.1.42:22000'
    })
    const body = JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)
    expect(body.devices[0]).toMatchObject({
      deviceID: 'PEERDEVICE',
      addresses: ['tcp://192.168.1.42:22000']
    })
    expect(body.folders[0].devices).toEqual([{ deviceID: 'PEERDEVICE' }])
  })

  it('returns a disconnected status instead of throwing when ping fails', async() => {
    const manager = new SyncthingManager({
      fetchImpl: vi.fn(async() => jsonResponse({ error: 'nope' }, false, 503))
    })

    await expect(manager.ping()).resolves.toMatchObject({
      connected: false,
      lastError: 'Syncthing API returned HTTP 503.'
    })
  })
})
