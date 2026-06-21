import { describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { RcloneVaultEngine } from 'main_renderer/elephantnote/sync/rcloneVaultEngine.js'
import { RcloneManager } from 'main_renderer/elephantnote/sync/RcloneManager.js'

const tempVault = async() => fs.mkdtemp(path.join(os.tmpdir(), 'elephant-rclone-engine-'))

const fakeRclone = (calls = [], executor = async() => ({ stdout: 'ok', stderr: '' })) =>
  new RcloneManager({
    executor: vi.fn(async(binary, args, options) => {
      calls.push({ binary, args, options })
      return executor(binary, args, options)
    })
  })

describe('RcloneVaultEngine', () => {
  it('queues and runs legacy init/snapshot operations through rclone bisync', async() => {
    const cwd = await tempVault()
    const calls = []
    const engine = new RcloneVaultEngine({ cwd, rclone: fakeRclone(calls) })

    const operation = engine.enqueue({ operation: 'init', payload: { remotePath: 'remote:vault' } })
    engine.enqueue({ operation: 'snapshot' })
    const status = await engine.run()

    expect(operation.status).toBe('done')
    expect(status.queued).toBe(0)
    expect(status.remotePath).toBe('remote:vault')
    expect(calls).toHaveLength(1)
    expect(calls[0].args.slice(0, 3)).toEqual(['bisync', cwd, 'remote:vault'])
    expect(calls[0].args).toContain('--resync')
  })

  it('persists remote path and first run state after a successful sync', async() => {
    const cwd = await tempVault()
    const engine = new RcloneVaultEngine({ cwd, rclone: fakeRclone() })

    await engine.run({ init: { remotePath: 'remote:vault' }, snapshot: {} })

    const config = await fs.readJson(path.join(cwd, '.elephantnote', 'sync-config.json'))
    expect(config).toMatchObject({ backend: 'rclone', remotePath: 'remote:vault', firstRunDone: true })
  })

  it('loads persisted config before a later sync run', async() => {
    const cwd = await tempVault()
    const calls = []
    await fs.ensureDir(path.join(cwd, '.elephantnote'))
    await fs.writeJson(path.join(cwd, '.elephantnote', 'sync-config.json'), {
      backend: 'rclone',
      remotePath: 'remote:vault',
      firstRunDone: true
    })
    const engine = new RcloneVaultEngine({ cwd, rclone: fakeRclone(calls) })

    engine.enqueue({ operation: 'snapshot' })
    await engine.run()

    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual(['bisync', cwd, 'remote:vault'])
  })

  it('keeps failed operations and diagnostics when rclone fails', async() => {
    const cwd = await tempVault()
    const engine = new RcloneVaultEngine({
      cwd,
      rclone: fakeRclone([], async() => { throw new Error('boom') })
    })

    await expect(engine.run({ init: { remotePath: 'remote:vault' }, snapshot: {} })).rejects.toThrow('boom')
    expect(engine.status().lastError).toContain('boom')
    expect(engine.status().history.at(-1)).toMatchObject({ operation: 'snapshot', status: 'error' })
  })

  it('rejects sync without an active vault path', async() => {
    const engine = new RcloneVaultEngine({ rclone: fakeRclone() })
    await expect(engine.run({ init: { remotePath: 'remote:vault' }, snapshot: {} })).rejects.toThrow('active vault')
  })

  it('rejects sync without a remote path', async() => {
    const cwd = await tempVault()
    const engine = new RcloneVaultEngine({ cwd, rclone: fakeRclone() })
    await expect(engine.run({ snapshot: {} })).rejects.toThrow('remote path')
  })

  it('clears in-memory config when changing vaults', async() => {
    const first = await tempVault()
    const second = await tempVault()
    const engine = new RcloneVaultEngine({ cwd: first, rclone: fakeRclone() })
    await engine.run({ init: { remotePath: 'remote:first' } })

    engine.setCwd(second)

    expect(engine.status().cwd).toBe(second)
    expect(engine.status().remotePath).toBe('')
    expect(engine.status().firstRunDone).toBe(false)
  })

  it('maps pull and push legacy operations to the same rclone bisync transport', async() => {
    const cwd = await tempVault()
    const calls = []
    const engine = new RcloneVaultEngine({ cwd, rclone: fakeRclone(calls) })

    await engine.run({ init: { remotePath: 'remote:vault' }, pull: {}, push: {} })

    expect(calls).toHaveLength(2)
    expect(calls[0].args[0]).toBe('bisync')
    expect(calls[1].args[0]).toBe('bisync')
  })
})
