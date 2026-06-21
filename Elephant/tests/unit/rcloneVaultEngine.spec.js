import { describe, expect, it } from 'vitest'
import { RcloneVaultEngine } from '../../back/app/sync/rcloneVaultEngine.js'
import { RcloneManager } from '../../back/app/sync/RcloneManager.js'

const createFakeRclone = (calls = []) => new RcloneManager({
  executor: async(binary, args, options) => {
    calls.push({ binary, args, options })
    return { stdout: 'ok', stderr: '' }
  }
})

describe('RcloneVaultEngine', () => {
  it('reports a simple idle status', () => {
    const engine = new RcloneVaultEngine({ cwd: '/vault', rclone: createFakeRclone() })
    expect(engine.status().cwd).toBe('/vault')
    expect(engine.status().running).toBe(false)
  })

  it('maps legacy snapshot runs to rclone bisync', async() => {
    const calls = []
    const engine = new RcloneVaultEngine({ cwd: '/vault', rclone: createFakeRclone(calls) })
    await engine.run({ init: { remotePath: 'remote:vault' }, snapshot: {} })
    expect(calls).toHaveLength(1)
    expect(calls[0].args.slice(0, 3)).toEqual(['bisync', '/vault', 'remote:vault'])
    expect(engine.status().history.map((item) => item.status)).toEqual(['done', 'done'])
  })
})
