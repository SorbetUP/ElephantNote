import { describe, expect, it, vi } from 'vitest'
import { createDomainClients } from '../../../../../Elephant/frontend/app/services/elephantnoteClient/domainClients'
import { ELEPHANTNOTE_API_ACTIONS as API } from '../../../../../Elephant/shared/apiActions'

const createClients = (responses = {}) => {
  const call = vi.fn(async (action, payload) => {
    const handler = responses[action]
    if (typeof handler === 'function') return handler(payload)
    if (handler !== undefined) return handler
    throw new Error(`Unexpected action: ${action}`)
  })
  return {
    call,
    clients: createDomainClients(call, () => {
      throw new Error('Atomic API is not used by this test')
    })
  }
}

describe('mobile Tauri creation contracts', () => {
  it('wraps a directly returned note and reloads its directory', async () => {
    const created = {
      path: 'Notes/Untitled.md',
      fullPath: '/vault/Notes/Untitled.md',
      title: 'Untitled',
      kind: 'note'
    }
    const entries = [created]
    const { call, clients } = createClients({
      [API.NOTES_CREATE]: created,
      [API.DIRECTORY_LIST]: entries
    })

    const result = await clients.notes.create('Notes')

    expect(result).toEqual({ note: created, entries })
    expect(call).toHaveBeenNthCalledWith(1, API.NOTES_CREATE, { relativePath: 'Notes' })
    expect(call).toHaveBeenNthCalledWith(2, API.DIRECTORY_LIST, { relativePath: 'Notes' })
  })

  it('creates a new folder below the current directory and reloads the parent', async () => {
    const created = {
      path: 'Projects/New Folder',
      fullPath: '/vault/Projects/New Folder',
      title: 'New Folder',
      kind: 'folder'
    }
    const entries = [created]
    const { call, clients } = createClients({
      [API.FOLDERS_CREATE]: created,
      [API.DIRECTORY_LIST]: entries
    })

    const result = await clients.folders.create('Projects')

    expect(result).toEqual({ folder: created, entries })
    expect(call).toHaveBeenNthCalledWith(1, API.FOLDERS_CREATE, {
      relativePath: 'Projects/New Folder'
    })
    expect(call).toHaveBeenNthCalledWith(2, API.DIRECTORY_LIST, {
      relativePath: 'Projects'
    })
  })

  it('preserves an already normalized desktop creation response', async () => {
    const normalized = {
      note: { path: 'Untitled.md', title: 'Untitled' },
      entries: [{ path: 'Untitled.md', title: 'Untitled' }]
    }
    const { call, clients } = createClients({
      [API.NOTES_CREATE]: normalized
    })

    await expect(clients.notes.create('')).resolves.toBe(normalized)
    expect(call).toHaveBeenCalledTimes(1)
  })
})
