import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { RcloneVaultEngine } from '../../back/app/sync/rcloneVaultEngine.js'
import { RcloneManager } from '../../back/app/sync/RcloneManager.js'

const createFakeRclone = (calls = [], { fail = false } = {}) => new RcloneManager({
  executor: async(binary, args, options) => {
    calls.push({ binary, args, options })
    if (fail) throw new Error('rclone exploded')
    return { stdout: 'ok', stderr: '' }
  }
})

const createTempVault = async() => fs.mkdtemp(path.join(os.tmpdir(), 'elephant-rclone-'))

describe('RcloneVaultEngine', () => {
  it('reports a simple idle status', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone() })
    expect(engine.status().cwd).toBe(vaultPath)
    expect(engine.status().running).toBe(false)
  })

  it('maps legacy snapshot runs to rclone bisync', async() => {
    const vaultPath = await createTempVault()
    const calls = []
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone(calls) })
    await engine.run({ init: { remotePath: 'remote:vault' }, snapshot: {} })
    expect(calls).toHaveLength(1)
    expect(calls[0].args.slice(0, 3)).toEqual(['bisync', vaultPath, 'remote:vault'])
    expect(engine.status().history.map((item) => item.status)).toEqual(['done', 'done'])
  })

  it('exposes the exact rclone execution plan before enqueueing', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone() })

    expect(engine.plan({ operations: ['init', 'sync'], init: { remotePath: 'remote:vault' }, sync: {} }))
      .toEqual([
        { operation: 'init', payload: { remotePath: 'remote:vault' } },
        { operation: 'sync', payload: {} }
      ])
    expect(engine.status().queued).toBe(0)
  })

  it('deduplicates identical queued sync operations', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone() })

    engine.enqueuePlan({ sync: { remotePath: 'remote:vault' } })
    engine.enqueuePlan({ sync: { remotePath: 'remote:vault' } })

    expect(engine.status().queued).toBe(1)
    expect(engine.status().operations.map((item) => item.operation)).toEqual(['sync'])
  })

  it('persists remote, first-run state, peers and history across engine instances', async() => {
    const vaultPath = await createTempVault()
    const calls = []
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone(calls) })

    await engine.run({
      init: {
        remotePath: 'remote:vault',
        peerDeviceId: 'phone-1',
        peerAddress: 'tcp://192.168.1.40:22000',
        vaultIds: ['vault-a']
      },
      sync: {}
    })

    const restored = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone() })
    await restored.loadConfig({ force: true })
    const status = restored.status()

    expect(calls).toHaveLength(1)
    expect(status).toMatchObject({
      configured: true,
      remotePath: 'remote:vault',
      firstRunDone: true,
      peers: [{ deviceId: 'phone-1', address: 'tcp://192.168.1.40:22000', vaultIds: ['vault-a'] }]
    })
    expect(status.history.map((item) => item.operation)).toEqual(['init', 'sync'])
  })

  it('records a missing remote as an actionable error without leaving stale queued work', async() => {
    const vaultPath = await createTempVault()
    const calls = []
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone(calls) })

    await engine.run({ sync: {} })
    const status = engine.status()

    expect(calls).toHaveLength(0)
    expect(status.queued).toBe(0)
    expect(status.lastError).toContain('remote')
    expect(status.history.at(-1)).toMatchObject({ operation: 'sync', status: 'error' })
  })

  it('preserves failed rclone attempts in history and clears the running flag', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath, rclone: createFakeRclone([], { fail: true }) })

    await expect(engine.run({ init: { remotePath: 'remote:vault' }, sync: {} })).rejects.toThrow('rclone exploded')

    expect(engine.status().running).toBe(false)
    expect(engine.status().lastError).toBe('rclone exploded')
    expect(engine.status().history.map((item) => item.status)).toEqual(['done', 'error'])
  })
})
