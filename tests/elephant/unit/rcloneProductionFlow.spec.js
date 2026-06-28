import { describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { RcloneVaultEngine } from '../../back/app/sync/rcloneVaultEngine.js'
import { RcloneManager } from '../../back/app/sync/RcloneManager.js'

const tempDir = (name) => fs.mkdtemp(path.join(os.tmpdir(), `elephant-${name}-`))

const listMarkdown = async(root) => {
  if (!await fs.pathExists(root)) return []
  return (await fs.readdir(root)).filter((file) => file.endsWith('.md')).sort()
}

const copyMarkdownBothWays = async(leftRoot, rightRoot) => {
  await fs.ensureDir(leftRoot)
  await fs.ensureDir(rightRoot)
  const files = new Set([...(await listMarkdown(leftRoot)), ...(await listMarkdown(rightRoot))])
  for (const file of files) {
    const left = path.join(leftRoot, file)
    const right = path.join(rightRoot, file)
    const leftExists = await fs.pathExists(left)
    const rightExists = await fs.pathExists(right)
    if (leftExists && !rightExists) await fs.copyFile(left, right)
    else if (!leftExists && rightExists) await fs.copyFile(right, left)
    else if (leftExists && rightExists) {
      const leftText = await fs.readFile(left, 'utf8')
      const rightText = await fs.readFile(right, 'utf8')
      if (leftText !== rightText) {
        const conflict = file.replace('.md', '.elephant-conflict.md')
        await fs.copyFile(right, path.join(leftRoot, conflict))
        await fs.copyFile(left, right)
      }
    }
  }
}

const fakeRclone = (calls = []) => new RcloneManager({
  executor: vi.fn(async(binary, args, options) => {
    calls.push({ binary, args, options })
    await copyMarkdownBothWays(args[1], args[2])
    return { stdout: 'fake bisync ok', stderr: '' }
  })
})

describe('production-like rclone sync flow', () => {
  it('syncs desktop and phone vaults through one shared location', async() => {
    const desktop = await tempDir('desktop-vault')
    const phone = await tempDir('phone-vault')
    const shared = await tempDir('shared-sync')
    const calls = []
    const desktopSync = new RcloneVaultEngine({ cwd: desktop, rclone: fakeRclone(calls) })
    const phoneSync = new RcloneVaultEngine({ cwd: phone, rclone: fakeRclone(calls) })

    await fs.writeFile(path.join(desktop, 'Desktop.md'), '# Desktop\n', 'utf8')
    await desktopSync.run({ remotePath: shared, sync: {} })
    await phoneSync.run({ remotePath: shared, sync: {} })
    await expect(fs.readFile(path.join(phone, 'Desktop.md'), 'utf8')).resolves.toContain('Desktop')

    await fs.writeFile(path.join(phone, 'Phone.md'), '# Phone\n', 'utf8')
    await phoneSync.run({ sync: {} })
    await desktopSync.run({ sync: {} })
    await expect(fs.readFile(path.join(desktop, 'Phone.md'), 'utf8')).resolves.toContain('Phone')

    await fs.writeFile(path.join(desktop, 'Shared.md'), 'desktop edit\n', 'utf8')
    await fs.writeFile(path.join(phone, 'Shared.md'), 'phone edit\n', 'utf8')
    await desktopSync.run({ sync: {} })
    await phoneSync.run({ sync: {} })
    expect(await fs.pathExists(path.join(phone, 'Shared.elephant-conflict.md'))).toBe(true)
    expect(calls.length).toBeGreaterThanOrEqual(6)
  })
})
