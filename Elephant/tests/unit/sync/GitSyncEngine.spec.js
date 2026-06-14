import { describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { GitSyncEngine } from 'main_renderer/elephantnote/sync/GitSyncEngine'

const tempVault = async() => fs.mkdtemp(path.join(os.tmpdir(), 'elephant-sync-'))

describe('GitSyncEngine', () => {
  it('queues and runs git operations without renderer or Electron coupling', async() => {
    const cwd = await tempVault()
    const executor = vi.fn(async() => ({ stdout: '', stderr: '' }))
    const engine = new GitSyncEngine({ cwd, executor })

    const operation = engine.enqueue({ operation: 'init' })
    const status = await engine.run()

    expect(operation.status).toBe('done')
    expect(status.queued).toBe(0)
    expect(executor).toHaveBeenCalledWith('git', ['init'], { cwd })
    expect(status.history[0]).toMatchObject({ operation: 'init', status: 'done' })
    expect(status.deviceId).toMatch(/^en-/)
  })

  it('creates compact git snapshots when the vault is dirty', async() => {
    const cwd = await tempVault()
    await fs.ensureDir(path.join(cwd, '.git'))
    const executor = vi.fn(async(_command, args) => {
      if (args[0] === 'status') return { stdout: ' M note.md\n', stderr: '' }
      if (args[0] === 'branch') return { stdout: 'main\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })
    const engine = new GitSyncEngine({ cwd, executor })

    engine.enqueue({ operation: 'snapshot', payload: { message: 'Manual snapshot' } })
    await engine.run()

    expect(executor).toHaveBeenCalledWith('git', ['add', '-A'], { cwd })
    expect(executor).toHaveBeenCalledWith('git', ['commit', '-m', 'Manual snapshot'], { cwd })
  })

  it('configures Syncthing folders when a Syncthing backend is selected', async() => {
    const cwd = await tempVault()
    const executor = vi.fn(async() => ({ stdout: '', stderr: '' }))
    const syncthing = {
      status: vi.fn(() => ({ configured: true, connected: false, endpoint: 'http://127.0.0.1:8384' })),
      configure: vi.fn(),
      ping: vi.fn(async() => ({ connected: true })),
      ensureFolder: vi.fn(async(folder) => folder),
      ensurePeer: vi.fn(async(peer) => peer),
      folderStatus: vi.fn(async() => ({ configured: true, connected: true, endpoint: 'http://127.0.0.1:8384', folderState: 'idle' }))
    }
    const engine = new GitSyncEngine({ cwd, executor, syncthing })

    engine.enqueue({
      operation: 'init',
      payload: {
        backend: 'syncthing-git',
        syncthingEndpoint: 'http://127.0.0.1:8384',
        syncthingApiKey: 'secret',
        peerDeviceId: 'PEERDEVICE',
        peerAddress: 'tcp://192.168.1.42:22000'
      }
    })
    const status = await engine.run()

    expect(syncthing.configure).toHaveBeenCalledWith({
      endpoint: 'http://127.0.0.1:8384',
      apiKey: 'secret',
      binaryPath: ''
    })
    expect(syncthing.ensureFolder).toHaveBeenCalledWith(expect.objectContaining({
      path: cwd,
      type: 'sendreceive'
    }))
    expect(syncthing.ensurePeer).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'PEERDEVICE',
      address: 'tcp://192.168.1.42:22000'
    }))
    expect(status.backend).toBe('syncthing-git')
    expect(status.peers).toEqual([{ deviceId: 'PEERDEVICE', address: 'tcp://192.168.1.42:22000' }])
    expect(status.syncthing).toMatchObject({ connected: true, folderState: 'idle' })
  })

  it('can enqueue a partial sync plan for configuration-only UI actions', async() => {
    const cwd = await tempVault()
    const executor = vi.fn(async() => ({ stdout: '', stderr: '' }))
    const engine = new GitSyncEngine({ cwd, executor })

    engine.enqueuePlan({ init: { branch: 'main' } })
    const status = await engine.run()

    expect(status.history.map((item) => item.operation)).toEqual(['init'])
    expect(executor).not.toHaveBeenCalledWith('git', ['pull', '--ff-only', 'origin', 'main'], { cwd })
    expect(executor).not.toHaveBeenCalledWith('git', ['push', '-u', 'origin', 'main'], { cwd })
  })

  it('rejects unknown operations and keeps diagnostics', async() => {
    const cwd = await tempVault()
    const engine = new GitSyncEngine({
      cwd,
      executor: vi.fn(async() => ({ stdout: '', stderr: '' }))
    })
    engine.enqueue({ operation: 'unknown' })

    await expect(engine.run()).rejects.toThrow('Unknown sync operation')
    expect(engine.status().lastError).toContain('Unknown sync operation')
    expect(engine.status().operations[0].status).toBe('error')
  })
})
