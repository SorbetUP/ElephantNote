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

  it('propagates local deletes to the shared folder after a previous sync', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(vaultPath, 'Deleted.md'), '# Delete me\n')
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    await engine.run({ init: { remotePath }, sync: {} })
    await fs.remove(path.join(vaultPath, 'Deleted.md'))
    const status = await engine.run({ sync: {} })

    await expect(fs.pathExists(path.join(remotePath, 'Deleted.md'))).resolves.toBe(false)
    expect(status.lastError).toBe('')
  })

  it('propagates remote deletes to the local vault after a previous sync', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(vaultPath, 'RemoteDeleted.md'), '# Delete remotely\n')
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    await engine.run({ init: { remotePath }, sync: {} })
    await fs.remove(path.join(remotePath, 'RemoteDeleted.md'))
    const status = await engine.run({ sync: {} })

    await expect(fs.pathExists(path.join(vaultPath, 'RemoteDeleted.md'))).resolves.toBe(false)
    expect(status.lastError).toBe('')
  })

  it('does not delete a file changed remotely after it was deleted locally', async() => {
    const vaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    await fs.writeFile(path.join(vaultPath, 'DeleteConflict.md'), '# Original\n')
    const engine = new RcloneVaultEngine({ cwd: vaultPath })

    await engine.run({ init: { remotePath }, sync: {} })
    await fs.remove(path.join(vaultPath, 'DeleteConflict.md'))
    await fs.writeFile(path.join(remotePath, 'DeleteConflict.md'), '# Changed remotely\n')
    const status = await engine.run({ sync: {} })

    await expect(readText(remotePath, 'DeleteConflict.md')).resolves.toContain('Changed remotely')
    expect(status.lastError).toContain('kept both versions')
    expect(status.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'DeleteConflict.md' })
    ]))
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

  it('pairs two desktop vaults with a manual ElephantNote code', async() => {
    const firstVaultPath = await createTempVault()
    const secondVaultPath = await createTempVault()
    const remotePath = await createTempVault('elephant-local-remote-')
    const first = new RcloneVaultEngine({ cwd: firstVaultPath })
    const second = new RcloneVaultEngine({ cwd: secondVaultPath })

    const invite = await first.createInvite({ remotePath, deviceName: 'Desktop A' })
    const result = await second.acceptInvite({ manualCode: invite.manualCode })

    expect(invite.manualCode).toContain('elephantnote-local-sync-pairing')
    expect(result.status).toMatchObject({
      configured: true,
      remotePath,
      peers: [
        expect.objectContaining({
          name: 'Desktop A',
          address: remotePath
        })
      ]
    })
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
