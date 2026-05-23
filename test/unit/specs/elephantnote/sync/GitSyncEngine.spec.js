import { describe, expect, it, vi } from 'vitest'
import { GitSyncEngine } from 'main_renderer/elephantnote/sync/GitSyncEngine'

describe('GitSyncEngine', () => {
  it('queues and runs git operations without renderer or Electron coupling', async() => {
    const executor = vi.fn(async() => ({ stdout: 'clean', stderr: '' }))
    const engine = new GitSyncEngine({ cwd: '/vault', executor })

    const operation = engine.enqueue({ operation: 'snapshot' })
    const status = await engine.run()

    expect(operation.status).toBe('done')
    expect(status.queued).toBe(0)
    expect(executor).toHaveBeenCalledWith('git', ['status', '--short'], { cwd: '/vault' })
  })

  it('rejects unknown operations and keeps diagnostics', async() => {
    const engine = new GitSyncEngine({
      cwd: '/vault',
      executor: vi.fn(async() => ({ stdout: '', stderr: '' }))
    })
    engine.enqueue({ operation: 'unknown' })

    await expect(engine.run()).rejects.toThrow('Unknown sync operation')
    expect(engine.status().lastError).toContain('Unknown sync operation')
    expect(engine.status().operations[0].status).toBe('error')
  })
})
