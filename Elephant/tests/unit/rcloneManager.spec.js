import { describe, expect, it } from 'vitest'
import { RcloneManager } from '../../back/app/sync/RcloneManager.js'

describe('RcloneManager', () => {
  it('resolves system binary by default', async() => {
    const manager = new RcloneManager({ executor: async() => ({ stdout: '', stderr: '' }) })
    expect(await manager.resolveBinary()).toBe('rclone')
  })
})
