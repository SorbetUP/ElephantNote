import { describe, expect, it } from 'vitest'
import { installTauriElephantNoteBridge } from '@/platform/tauriElephantNoteBridge.js'

const createTarget = () => {
  const calls = []
  const store = new Map()
  const target = {
    __TAURI__: {
      core: {
        invoke: async(command, payload = {}) => {
          calls.push({ command, payload })
          return { command, payload }
        }
      }
    },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value)
    },
    electron: {}
  }
  return { target, calls }
}

describe('tauriElephantNoteBridge', () => {
  it('routes direct sync plan payloads to the Rust command', async() => {
    const { target, calls } = createTarget()
    const payload = { operations: ['init', 'pull'], pull: { remoteName: 'origin' } }

    expect(installTauriElephantNoteBridge(target)).toBe(true)
    await target.elephantnote.sync.plan(payload)

    expect(calls).toEqual([
      { command: 'tauri_sync_plan', payload: { payloadByOperation: payload } }
    ])
  })

  it('routes public API sync.plan payloads to the Rust command', async() => {
    const { target, calls } = createTarget()
    const payload = { sync: { remoteName: 'origin' } }

    expect(installTauriElephantNoteBridge(target)).toBe(true)
    await target.elephantnote.api.call('sync.plan', payload)

    expect(calls).toEqual([
      { command: 'tauri_sync_plan', payload: { payloadByOperation: payload } }
    ])
  })

  it('keeps paged directory.list options when routing through the public API', async() => {
    const { target, calls } = createTarget()
    const payload = { relativePath: 'Projects', offset: 120, limit: 121, includePreview: false }

    expect(installTauriElephantNoteBridge(target)).toBe(true)
    await target.elephantnote.api.call('directory.list', payload)

    expect(calls).toEqual([
      { command: 'tauri_directory_list', payload }
    ])
  })
})
