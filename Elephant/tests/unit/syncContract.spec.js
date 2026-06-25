import { describe, expect, it } from 'vitest'
import {
  SYNC_ERROR_CODES,
  SYNC_BACKENDS,
  SYNC_OPERATION_SEQUENCE,
  SYNC_OPERATIONS,
  SYNC_STATUSES,
  createDefaultSyncPlan,
  createMissingVaultSyncError,
  createSyncHistoryRecord,
  createSyncQueueItem,
  createSyncStatus,
  mergeSyncPeers,
  normalizeSyncOperation,
  normalizeSyncPeer
} from 'common/elephantnote/sync'

describe('ElephantNote sync contract', () => {
  it('defines the portable sync operation plan', () => {
    expect(SYNC_OPERATION_SEQUENCE).toEqual([
      SYNC_OPERATIONS.INIT,
      SYNC_OPERATIONS.SNAPSHOT
    ])
    expect(createDefaultSyncPlan({
      snapshot: { message: 'Manual snapshot' }
    })).toEqual([
      { operation: 'init', payload: {} },
      { operation: 'snapshot', payload: { message: 'Manual snapshot' } }
    ])
    expect(normalizeSyncOperation('sync')).toBe(SYNC_OPERATIONS.SYNC)
  })

  it('normalizes queue items and rejects unknown operations', () => {
    const item = createSyncQueueItem(
      { operation: ' snapshot ', payload: { message: 'A' } },
      new Date('2026-06-14T00:00:00.000Z')
    )

    expect(item).toMatchObject({
      operation: 'snapshot',
      payload: { message: 'A' },
      status: SYNC_STATUSES.QUEUED,
      createdAt: '2026-06-14T00:00:00.000Z'
    })
    expect(normalizeSyncOperation('missing')).toBe('')
    expect(() => createSyncQueueItem({ operation: 'missing' })).toThrow('Unknown sync operation')
  })

  it('normalizes sync peers for portable device pairing state', () => {
    const peer = normalizeSyncPeer({
      deviceId: ' phone-1 ',
      deviceName: 'Phone',
      peerAddress: ' tcp://192.168.1.40:22000 ',
      vaultIds: ['vault-a', '', 'vault-a'],
      online: true,
      pairedAt: '2026-06-14T00:00:00.000Z'
    }, new Date('2026-06-14T00:05:00.000Z'))

    expect(peer).toMatchObject({
      id: 'phone-1',
      deviceId: 'phone-1',
      name: 'Phone',
      address: 'tcp://192.168.1.40:22000',
      vaultIds: ['vault-a'],
      online: true,
      pairedAt: '2026-06-14T00:00:00.000Z',
      lastSeenAt: '2026-06-14T00:05:00.000Z'
    })
  })

  it('merges sync peers without duplicating re-discovered devices', () => {
    const peers = mergeSyncPeers(
      [{ deviceId: 'phone-1', name: 'Phone', vaultIds: ['vault-a'], pairedAt: '2026-06-14T00:00:00.000Z' }],
      [{ id: 'phone-1', label: 'Phone LAN', peerAddress: 'dynamic', vaultIds: ['vault-b'], online: true }],
      new Date('2026-06-14T00:10:00.000Z')
    )

    expect(peers).toHaveLength(1)
    expect(peers[0]).toMatchObject({
      id: 'phone-1',
      deviceId: 'phone-1',
      name: 'Phone LAN',
      address: 'dynamic',
      online: true,
      pairedAt: '2026-06-14T00:00:00.000Z',
      lastSeenAt: '2026-06-14T00:10:00.000Z'
    })
    expect(peers[0].vaultIds).toEqual(['vault-a', 'vault-b'])
  })

  it('creates portable status, history and error shapes', () => {
    const item = {
      id: 'sync-1',
      operation: 'pull',
      status: 'done',
      updatedAt: '2026-06-14T00:00:00.000Z'
    }

    expect(createSyncHistoryRecord(item)).toEqual({
      id: 'sync-1',
      operation: 'pull',
      status: 'done',
      updatedAt: '2026-06-14T00:00:00.000Z',
      error: ''
    })
    expect(createSyncStatus({
      cwd: '/vault',
      queue: [{ status: 'queued' }, { status: 'done' }],
      config: { peers: [{ deviceId: 'phone-1', online: true }] }
    }))
      .toMatchObject({
        cwd: '/vault',
        backend: SYNC_BACKENDS.RCLONE,
        queued: 1,
        running: false,
        peers: [{ deviceId: 'phone-1', online: true }],
        syncthing: {
          configured: false,
          connected: false
        }
      })
    expect(createMissingVaultSyncError()).toMatchObject({
      code: SYNC_ERROR_CODES.NO_VAULT
    })
  })
})
