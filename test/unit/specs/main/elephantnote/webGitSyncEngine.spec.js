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

const createNoopGitExecutor = (calls = []) => async(_command, args) => {
  calls.push(args)
  if (args[0] === 'config' && args.length === 2) return { stdout: '' }
  return { stdout: '' }
}

const pathExists = async(target) => fs.access(target).then(() => true, () => false)

afterEach(async() => {
  while (tempRoots.length) await fs.rm(tempRoots.pop(), { recursive: true, force: true })
})

describe('WebGitSyncEngine', () => {
  it('preserves direct string enqueue operations', async() => {
    const cwd = await createTempVault()
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    const item = engine.enqueue('init')

    expect(item.operation).toBe('init')
    expect(engine.status().operations.at(-1).operation).toBe('init')
  })

  it('persists a git backend config in the canonical tauri-compatible sync directory', async() => {
    const cwd = await createTempVault()
    const calls = []
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor(calls) })

    await engine.init()

    const config = JSON.parse(await fs.readFile(path.join(cwd, '.elephantnote', 'sync', 'sync-config.json'), 'utf8'))
    const exclude = await fs.readFile(path.join(cwd, '.git', 'info', 'exclude'), 'utf8')

    expect(config.backend).toBe('git')
    expect(config.deviceId).toMatch(/^en-/)
    expect(config.folderId).toMatch(/^vault-/)
    expect(exclude).toContain('/.elephantnote/sync/sync-config.json')
    expect(exclude).toContain('/.elephantnote/sync/sync-log.json')
    expect(exclude).toContain('/.elephantnote/sync-config.json')
    expect(exclude).toContain('/.elephantnote/sync-log.json')
    expect(calls).toContainEqual([
      'rm',
      '--cached',
      '--ignore-unmatch',
      '.elephantnote/sync/sync-config.json',
      '.elephantnote/sync/sync-log.json',
      '.elephantnote/sync-config.json',
      '.elephantnote/sync-log.json'
    ])
  })

  it('migrates legacy root sync config into the canonical sync directory', async() => {
    const cwd = await createTempVault()
    await fs.mkdir(path.join(cwd, '.elephantnote'), { recursive: true })
    await fs.writeFile(path.join(cwd, '.elephantnote', 'sync-config.json'), JSON.stringify({
      version: 2,
      deviceId: 'en-legacy-device',
      folderId: 'vault-legacy-folder',
      folderLabel: 'Legacy Vault',
      backend: 'git',
      mode: 'send-receive',
      remoteName: 'backup',
      remote: '/git/legacy.git',
      remotePath: '',
      branch: 'notes',
      peers: [],
      updatedAt: '0'
    }), 'utf8')
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    await engine.init()

    const migrated = JSON.parse(await fs.readFile(path.join(cwd, '.elephantnote', 'sync', 'sync-config.json'), 'utf8'))
    expect(migrated.deviceId).toBe('en-legacy-device')
    expect(migrated.folderId).toBe('vault-legacy-folder')
    expect(migrated.remoteName).toBe('backup')
    expect(migrated.remote).toBe('/git/legacy.git')
    expect(migrated.branch).toBe('notes')
  })

  it('writes sync history into the canonical sync directory only', async() => {
    const cwd = await createTempVault()
    const engine = new WebGitSyncEngine({ cwd, executor: createNoopGitExecutor() })

    await engine.run({ init: {} })

    const canonicalHistoryPath = path.join(cwd, '.elephantnote', 'sync', 'sync-log.json')
    const legacyHistoryPath = path.join(cwd, '.elephantnote', 'sync-log.json')
    const history = JSON.parse(await fs.readFile(canonicalHistoryPath, 'utf8'))

    expect(history.history.some((item) => item.operation === 'init' && item.status === 'done')).toBe(true)
    expect(await pathExists(canonicalHistoryPath)).toBe(true)
    expect(await pathExists(legacyHistoryPath)).toBe(false)
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
