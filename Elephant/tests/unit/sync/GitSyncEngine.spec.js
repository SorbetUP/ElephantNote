import { describe, expect, it, vi } from 'vitest'
import { GitSyncEngine } from 'main_renderer/elephantnote/sync/GitSyncEngine'

describe('GitSyncEngine', () => {
  it('queues and runs git operations without renderer or Electron coupling', async() => {
    const executor = vi.fn(async() => ({ stdout: '', stderr: '' }))
    const engine = new GitSyncEngine({ cwd: '/vault', executor })

    const operation = engine.enqueue({ operation: 'snapshot' })
    const status = await engine.run()

    expect(operation.status).toBe('done')
    expect(status.queued).toBe(0)
    expect(executor).toHaveBeenCalledWith('git', ['status', '--short'], { cwd: '/vault' })
    expect(status.history[0]).toMatchObject({ operation: 'snapshot', status: 'done' })
  })

  it('creates compact git snapshots when the vault is dirty', async() => {
    const executor = vi.fn(async(_command, args) => {
      if (args[0] === 'status') return { stdout: ' M note.md\n', stderr: '' }
      return { stdout: '', stderr: '' }
    })
    const engine = new GitSyncEngine({ cwd: '/vault', executor })

    engine.enqueue({ operation: 'snapshot', payload: { message: 'Manual snapshot' } })
    await engine.run()

    expect(executor).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/vault' })
    expect(executor).toHaveBeenCalledWith('git', ['commit', '-m', 'Manual snapshot'], { cwd: '/vault' })
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
