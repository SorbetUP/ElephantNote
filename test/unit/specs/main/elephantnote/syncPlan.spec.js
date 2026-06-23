import { describe, expect, it } from 'vitest'
import {
  SYNC_OPERATIONS,
  createDefaultSyncPlan
} from '../../../../../Elephant/shared/sync.js'

const operations = (plan) => plan.map((item) => item.operation)

describe('createDefaultSyncPlan', () => {
  it('keeps the legacy local snapshot plan when no explicit operation is provided', () => {
    expect(operations(createDefaultSyncPlan({}))).toEqual([
      SYNC_OPERATIONS.INIT,
      SYNC_OPERATIONS.SNAPSHOT
    ])
  })

  it('adds push when a caller explicitly asks for a remote upload', () => {
    const plan = createDefaultSyncPlan({
      init: { remote: '/git/elephantnote.git' },
      snapshot: { message: 'push note' },
      push: {}
    })

    expect(operations(plan)).toEqual([
      SYNC_OPERATIONS.INIT,
      SYNC_OPERATIONS.SNAPSHOT,
      SYNC_OPERATIONS.PUSH
    ])
    expect(plan[0].payload.remote).toBe('/git/elephantnote.git')
    expect(plan[1].payload.message).toBe('push note')
  })

  it('can pull into a second device without creating a local snapshot first', () => {
    const plan = createDefaultSyncPlan({
      init: { remote: '/git/elephantnote.git' },
      pull: {}
    })

    expect(operations(plan)).toEqual([
      SYNC_OPERATIONS.INIT,
      SYNC_OPERATIONS.PULL
    ])
  })

  it('supports explicit operation lists for smoke tests and future UI flows', () => {
    const plan = createDefaultSyncPlan({
      operations: ['init', 'pull', 'snapshot', 'push'],
      snapshot: { message: 'manual order' }
    })

    expect(operations(plan)).toEqual([
      SYNC_OPERATIONS.INIT,
      SYNC_OPERATIONS.PULL,
      SYNC_OPERATIONS.SNAPSHOT,
      SYNC_OPERATIONS.PUSH
    ])
    expect(plan[2].payload.message).toBe('manual order')
  })
})
