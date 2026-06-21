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
  normalizeSyncOperation
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
    expect(createSyncStatus({ cwd: '/vault', queue: [{ status: 'queued' }, { status: 'done' }] }))
      .toMatchObject({
        cwd: '/vault',
        backend: SYNC_BACKENDS.RCLONE,
        queued: 1,
        running: false,
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
