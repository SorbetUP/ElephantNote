import { describe, expect, it } from 'vitest'
import {
  LAN_SYNC_PROTOCOL,
  LAN_SYNC_VERSION,
  createPairingInvite,
  createPeerDescriptor,
  createPeerState,
  parsePairingInvite,
  parsePeerDescriptor,
  serializePeerDescriptor
} from '../back/app/sync/lanPeerProtocol.js'

describe('LAN peer sync protocol', () => {
  it('creates a local network peer announcement', () => {
    const descriptor = createPeerDescriptor({
      deviceId: 'mac-1',
      deviceName: 'MacBook',
      host: '192.168.1.20',
      port: 48652,
      vaults: [{ id: 'work', name: 'Work' }]
    })

    expect(descriptor).toMatchObject({
      protocol: LAN_SYNC_PROTOCOL,
      version: LAN_SYNC_VERSION,
      kind: 'peer-announcement',
      deviceId: 'mac-1',
      deviceName: 'MacBook',
      host: '192.168.1.20',
      port: 48652
    })
    expect(descriptor.capabilities.encryptedSync).toBe(true)
    expect(descriptor.vaults).toEqual([{ id: 'work', name: 'Work', shared: true }])
  })

  it('serializes and parses peer announcements', () => {
    const serialized = serializePeerDescriptor({ deviceId: 'phone-1', host: '192.168.1.30' })
    expect(parsePeerDescriptor(serialized)).toMatchObject({ deviceId: 'phone-1', host: '192.168.1.30' })
  })

  it('rejects unsupported LAN messages', () => {
    expect(() => parsePeerDescriptor(JSON.stringify({ protocol: 'other', version: 1 }))).toThrow('Unsupported')
  })

  it('creates and parses encrypted pairing invites', () => {
    const invite = createPairingInvite({
      fromDeviceId: 'mac-1',
      fromDeviceName: 'MacBook',
      vaultScope: 'all',
      endpoint: 'http://192.168.1.20:48652',
      publicKey: 'pub',
      salt: 'salt'
    })

    expect(invite).toMatchObject({
      type: 'elephant-lan-pairing-invite',
      encrypted: true,
      vaultScope: 'all'
    })
    expect(parsePairingInvite(JSON.stringify(invite))).toMatchObject({ fromDeviceId: 'mac-1' })
  })

  it('tracks offline and online peer state', () => {
    expect(createPeerState({ descriptor: { deviceId: 'phone-1' }, online: false })).toMatchObject({
      deviceId: 'phone-1',
      online: false
    })
  })
})
