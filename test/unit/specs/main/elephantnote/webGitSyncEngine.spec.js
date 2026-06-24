import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebGitSyncEngine } from '../../../../../web/sync/WebGitSyncEngine.mjs'

const tempRoots = []

const createTempVault = async() => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-web-sync-'))
  tempRoots.push(root)
  return root
}

const createNoopGitExecutor = () => async(_command, args) => {
  if (args[0] === 'config' && args.length === 2) return { stdout: '' }
  return { stdout: '' }
}

afterEach(async() => {
  while (tempRoots.length) await fs.rm(tempRoots.pop(), { recursive: true, force: true })
})

describe('WebGitSyncEngine', () => {
  it('persists a git backend config and excludes local sync metadata from commits', async() => {
    const cwd = await createTempVault()
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    await engine.init()

    const config = JSON.parse(await fs.readFile(path.join(cwd, '.elephantnote', 'sync-config.json'), 'utf8'))
    const exclude = await fs.readFile(path.join(cwd, '.git', 'info', 'exclude'), 'utf8')

    expect(config.backend).toBe('git')
    expect(config.deviceId).toMatch(/^en-/)
    expect(config.folderId).toMatch(/^vault-/)
    expect(exclude).toContain('/.elephantnote/sync-config.json')
    expect(exclude).toContain('/.elephantnote/sync-log.json')
  })

  it('returns a completed status after a successful sync run', async() => {
    const cwd = await createTempVault()
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    const status = await engine.run({ init: {} })

    expect(status.running).toBe(false)
    expect(status.queued).toBe(0)
    expect(status.history.some((item) => item.operation === 'init' && item.status === 'done')).toBe(true)
  })

  it('compacts completed queue items so periodic auto-sync cannot grow memory forever', async() => {
    const cwd = await createTempVault()
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    for (let index = 0; index < 130; index += 1) {
      await engine.run({ init: {} })
    }

    expect(engine.queue.length).toBeLessThanOrEqual(100)
    expect(engine.status().operations.length).toBeLessThanOrEqual(20)
    expect(engine.status().queued).toBe(0)
  })
})
