import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { RcloneVaultEngine } from '../../back/app/sync/rcloneVaultEngine.js'
import { RcloneManager } from '../../back/app/sync/RcloneManager.js'

const createFakeRclone = (calls = []) => new RcloneManager({
  executor: async(binary, args, options) => {
    calls.push({ binary, args, options })
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
})
