import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { RcloneVaultEngine } from '../../back/app/sync/rcloneVaultEngine.js'
import { SYNC_BACKENDS } from '../../shared/sync.js'

const createTempVault = async(prefix = 'elephant-local-sync-') => fs.mkdtemp(path.join(os.tmpdir(), prefix))
const readText = async(root, relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

describe('RcloneVaultEngine embedded local sync compatibility wrapper', () => {
  it('reports an embedded local backend without external binaries', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    expect(engine.status()).toMatchObject({
      cwd: vaultPath,
      running: false,
      backend: SYNC_BACKENDS.ELEPHANT_LOCAL,
      capabilities: {
        embeddedBackend: true,
        requiresExternalBinary: false,
        requiresCloudAccount: false,
        encryptionRequired: true,
        desktopRclone: false,
        mobileRcloneBinary: false,
        mobileSyncRequiresBackend: false
      }
    })
  })

  it('copies local notes to a shared folder target', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(vaultPath, 'Daily.md'), '# Daily\n\nCreated locally.\n')

    const engine = new RcloneVaultEngine({ cwd: vaultPath })
    const status = await engine.run({ init: { remotePath }, push: {} })

    expect(status).toMatchObject({
      configured: true,
      remotePath,
      firstRunDone: true,
      backend: SYNC_BACKENDS.ELEPHANT_LOCAL
    })
    expect(await readText(remotePath, 'Daily.md')).toContain('Created locally.')
    expect(status.history.map((item) => item.operation)).toEqual(['init', 'push'])
  })

  it('pulls remote notes into the local vault', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(remotePath, 'Remote.md'), '# Remote\n\nCreated remotely.\n')

    const engine = new RcloneVaultEngine({ cwd: vaultPath })
    const status = await engine.run({ init: { remotePath }, pull: {} })

    expect(await readText(vaultPath, 'Remote.md')).toContain('Created remotely.')
    expect(status.queued).toBe(0)
    expect(status.history.map((item) => item.operation)).toEqual(['init', 'pull'])
  })

  it('keeps both versions when local and remote changed the same note', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(vaultPath, 'Conflict.md'), '# Conflict\n\nLocal edit.\n')
    await fs.writeFile(path.join(remotePath, 'Conflict.md'), '# Conflict\n\nRemote edit.\n')

    const engine = new RcloneVaultEngine({ cwd: vaultPath })
    const status = await engine.run({ init: { remotePath }, sync: {} })
    const localFiles = await fs.readdir(vaultPath)
    const remoteFiles = await fs.readdir(remotePath)

    expect(status.lastError).toContain('kept both versions')
    expect(status.conflicts).toHaveLength(2)
    expect(localFiles.some((file) => file.includes('remote-conflict'))).toBe(true)
    expect(remoteFiles.some((file) => file.includes('local-conflict'))).toBe(true)
    expect(await readText(vaultPath, 'Conflict.md')).toContain('Local edit.')
    expect(await readText(remotePath, 'Conflict.md')).toContain('Remote edit.')
  })

  it('persists target, first-run state, peers and history across engine instances', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    await engine.run({
      init: {
        remotePath,
        peerDeviceId: 'peer-1',
        peerAddress: 'local-peer',
        vaultIds: ['vault-a']
      },
      sync: {}
    })

    const restored = new RcloneVaultEngine({ cwd: vaultPath })
    await restored.loadConfig({ force: true })
    const status = restored.status()

    expect(status).toMatchObject({
      configured: true,
      remotePath,
      firstRunDone: true,
      peers: [{ deviceId: 'peer-1', address: 'local-peer', vaultIds: ['vault-a'] }]
    })
    expect(status.history.map((item) => item.operation)).toEqual(['init', 'sync'])
  })

  it('records a missing target as an actionable error without leaving stale queued work', async() => {
    const vaultPath = await createTempVault()
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    await engine.run({ sync: {} })
    const status = engine.status()

    expect(status.queued).toBe(0)
    expect(status.lastError).toContain('target')
    expect(status.history.at(-1)).toMatchObject({ operation: 'sync', status: 'error' })
  })
})
