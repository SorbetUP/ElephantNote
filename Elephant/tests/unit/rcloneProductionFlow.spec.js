import { describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { RcloneVaultEngine } from '../back/app/sync/rcloneVaultEngine.js'
import { RcloneManager } from '../back/app/sync/RcloneManager.js'

const tempDir = async(name) => fs.mkdtemp(path.join(os.tmpdir(), `elephant-${name}-`))

const walkFiles = async(root) => {
  const result = []
  const visit = async(dir) => {
    for (const entry of await fs.readdir(dir)) {
      if (entry === '.elephantnote') continue
      const full = path.join(dir, entry)
      const stat = await fs.stat(full)
      if (stat.isDirectory()) await visit(full)
      else result.push(path.relative(root, full))
    }
  }
  if (await fs.pathExists(root)) await visit(root)
  return result.sort()
}

const copyFile = async(fromRoot, toRoot, relativePath) => {
  await fs.ensureDir(path.dirname(path.join(toRoot, relativePath)))
  await fs.copyFile(path.join(fromRoot, relativePath), path.join(toRoot, relativePath))
}

const createFakeBisyncExecutor = (calls = []) => vi.fn(async(binary, args, options) => {
  calls.push({ binary, args, options })
  const localPath = args[1]
  const remotePath = args[2]
  await fs.ensureDir(localPath)
  await fs.ensureDir(remotePath)

  const files = new Set([...(await walkFiles(localPath)), ...(await walkFiles(remotePath))])
  for (const relativePath of files) {
    const left = path.join(localPath, relativePath)
    const right = path.join(remotePath, relativePath)
    const leftExists = await fs.pathExists(left)
    const rightExists = await fs.pathExists(right)
    if (leftExists && !rightExists) await copyFile(localPath, remotePath, relativePath)
    else if (!leftExists && rightExists) await copyFile(remotePath, localPath, relativePath)
    else if (leftExists && rightExists) {
      const leftText = await fs.readFile(left, 'utf8')
      const rightText = await fs.readFile(right, 'utf8')
      if (leftText !== rightText) {
        const conflictPath = relativePath.replace(/(\.[^/.]+)?$/, '.elephant-conflict$1')
        await copyFile(remotePath, localPath, conflictPath)
        await copyFile(localPath, remotePath, relativePath)
      }
    }
  }
  return { stdout: 'fake bisync ok', stderr: '' }
})

describe('production-like rclone sync flow', () => {
  it('syncs two vaults through a shared remote and keeps conflicts visible', async() => {
    const vaultA = await tempDir('vault-a')
    const vaultB = await tempDir('vault-b')
    const remote = await tempDir('remote')
    const calls = []
    const executor = createFakeBisyncExecutor(calls)
    const rcloneA = new RcloneManager({ executor })
    const rcloneB = new RcloneManager({ executor })
    const engineA = new RcloneVaultEngine({ cwd: vaultA, rclone: rcloneA })
    const engineB = new RcloneVaultEngine({ cwd: vaultB, rclone: rcloneB })

    await fs.writeFile(path.join(vaultA, 'A.md'), '# From desktop\n', 'utf8')
    await engineA.run({ remotePath: remote, sync: {} })
    await engineB.run({ remotePath: remote, sync: {} })
    await expect(fs.readFile(path.join(vaultB, 'A.md'), 'utf8')).resolves.toContain('From desktop')

    await fs.writeFile(path.join(vaultB, 'B.md'), '# From phone\n', 'utf8')
    await engineB.run({ sync: {} })
    await engineA.run({ sync: {} })
    await expect(fs.readFile(path.join(vaultA, 'B.md'), 'utf8')).resolves.toContain('From phone')

    await fs.writeFile(path.join(vaultA, 'Shared.md'), 'desktop edit\n', 'utf8')
    await fs.writeFile(path.join(vaultB, 'Shared.md'), 'phone edit\n', 'utf8')
    await engineA.run({ sync: {} })
    await engineB.run({ sync: {} })

    const bFiles = await walkFiles(vaultB)
    expect(bFiles.some((file) => file.includes('elephant-conflict'))).toBe(true)
    expect(calls.length).toBeGreaterThanOrEqual(6)
  })
})
