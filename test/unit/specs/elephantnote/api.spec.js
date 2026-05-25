/* @vitest-environment node */

import {
  createElephantNoteApi,
  ELEPHANTNOTE_API_ACTIONS,
  ELEPHANTNOTE_API_VERSION
} from 'main_renderer/elephantnote/api'
import { vi } from 'vitest'

describe('ElephantNote API contract', () => {
  it('describes versioned actions', async() => {
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.NOTES_CREATE]: async() => ({ ok: true })
      }
    })

    expect(api.version).to.equal(ELEPHANTNOTE_API_VERSION)
    expect(api.describe()).to.deep.equal({
      version: ELEPHANTNOTE_API_VERSION,
      actions: [
        ELEPHANTNOTE_API_ACTIONS.API_DESCRIBE,
        ELEPHANTNOTE_API_ACTIONS.NOTES_CREATE
      ].sort()
    })
  })

  it('calls registered handlers with payload and context', async() => {
    const api = createElephantNoteApi({
      handlers: {
        'notes.echo': async(payload, context) => ({
          payload,
          actor: context.actor
        })
      }
    })

    await expect(api.call('notes.echo', { title: 'A' }, { actor: 'test' }))
      .resolves.to.deep.equal({
        payload: { title: 'A' },
        actor: 'test'
      })
  })

  it('returns response envelopes for agents and tests', async() => {
    const api = createElephantNoteApi({
      handlers: {
        'notes.ok': async() => 42
      }
    })

    await expect(api.callEnvelope('notes.ok')).resolves.to.include({
      ok: true,
      version: ELEPHANTNOTE_API_VERSION,
      action: 'notes.ok',
      data: 42
    })

    const failed = await api.callEnvelope('missing.action')
    expect(failed.ok).to.equal(false)
    expect(failed.error.code).to.equal('ELEPHANTNOTE_UNKNOWN_API_ACTION')
  })

  it('rejects invalid payloads before executing handlers', async() => {
    const handler = vi.fn(async() => ({ deleted: true }))
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.ENTRIES_DELETE]: handler
      }
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.ENTRIES_DELETE, {})

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
    expect(handler).not.toHaveBeenCalled()
  })

  it('validates Atomic model selection payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_SET]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_SET, {
      embedding: 'nomic-embed-text',
      chat: 'llama-3.2',
      'speech-to-text': 'whisper-large-v3-turbo'
    })).resolves.toMatchObject({
      embedding: 'nomic-embed-text',
      chat: 'llama-3.2',
      'speech-to-text': 'whisper-large-v3-turbo'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_SET, {
      embedding: 42
    })

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates Google Calendar import payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.CALENDAR_IMPORT_GOOGLE_FROM_PATH]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.CALENDAR_IMPORT_GOOGLE_FROM_PATH, {
      sourcePath: '/tmp/calendar.ics'
    })).resolves.to.deep.equal({
      sourcePath: '/tmp/calendar.ics'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.CALENDAR_IMPORT_GOOGLE_FROM_PATH, {})

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })
})
