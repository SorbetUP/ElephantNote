/* @vitest-environment node */

import {
  createElephantNoteApi,
  ELEPHANTNOTE_API_DOMAINS,
  ELEPHANTNOTE_API_ACTIONS,
  ELEPHANTNOTE_API_VERSION
} from 'main_renderer/elephantnote/api'
import {
  API_PAYLOAD_SCHEMAS,
  listApiContracts
} from 'common/elephantnote/apiContracts'
import { describe, expect, it, vi } from 'vitest'

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

  it('keeps shared domain contracts, action constants and payload schemas in sync', () => {
    const contracts = listApiContracts()
    const actionNames = new Set(Object.values(ELEPHANTNOTE_API_ACTIONS))

    expect(ELEPHANTNOTE_API_DOMAINS).to.have.keys([
      'system',
      'vaults',
      'documents',
      'imports',
      'knowledge',
      'publishing',
      'automation',
      'aiRuntime',
      'plugins',
      'sync'
    ])
    expect(contracts.length).to.equal(actionNames.size)
    expect(Object.keys(API_PAYLOAD_SCHEMAS).sort()).to.deep.equal([...actionNames].sort())
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
      embedding: 'smollm2-node-llama-cpp',
      chat: 'smollm2-node-llama-cpp-chat',
      ocr: 'local-tesseract-ocr',
      naming: 'local-naming',
      summary: 'local-summary',
      agent: 'codex-compatible',
      'speech-to-text': 'whisper-large-v3-turbo'
    })).resolves.toMatchObject({
      embedding: 'smollm2-node-llama-cpp',
      chat: 'smollm2-node-llama-cpp-chat',
      ocr: 'local-tesseract-ocr',
      naming: 'local-naming',
      summary: 'local-summary',
      agent: 'codex-compatible',
      'speech-to-text': 'whisper-large-v3-turbo'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.MODEL_SELECTION_SET, {
      embedding: 42
    })

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates OCR extraction payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.OCR_EXTRACT]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.OCR_EXTRACT, {
      imagePath: '/tmp/screenshot.png',
      language: 'eng',
      pageSegmentationMode: '6'
    })).resolves.to.deep.equal({
      imagePath: '/tmp/screenshot.png',
      language: 'eng',
      pageSegmentationMode: '6'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.OCR_EXTRACT, {
      language: 'eng'
    })

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('rejects the removed global AI enabled setting from provider config payloads', async() => {
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_SET]: async(payload) => payload,
        [ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_TEST]: async(payload) => payload
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_SET, {
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp',
      endpoint: 'node-llama-cpp://local',
      model: 'smollm2-node-llama-cpp-chat'
    })).resolves.toMatchObject({
      preset: 'nodeLlamaCpp',
      transport: 'node-llama-cpp'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.AI_CONFIG_SET, {
      enabled: false
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

  it('validates Google Calendar OAuth config payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.CALENDAR_GOOGLE_CONFIG_SET]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.CALENDAR_GOOGLE_CONFIG_SET, {
      enabled: true,
      clientId: 'client',
      refreshToken: 'refresh',
      calendarId: 'primary'
    })).resolves.toMatchObject({
      enabled: true,
      calendarId: 'primary'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.CALENDAR_GOOGLE_CONFIG_SET, {
      enabled: 'yes'
    })
    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates source ingestion payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.SOURCES_INGEST_URL]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.SOURCES_INGEST_URL, {
      url: 'https://example.com',
      destinationRelativePath: 'Sources'
    })).resolves.to.deep.equal({
      url: 'https://example.com',
      destinationRelativePath: 'Sources'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.SOURCES_INGEST_URL, {})

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates wiki proposal workflow payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.WIKI_ACCEPT]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.WIKI_ACCEPT, {
      id: 'wiki-work'
    })).resolves.to.deep.equal({
      id: 'wiki-work'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.WIKI_ACCEPT, {})

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates plugin state payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.PLUGINS_SET]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.PLUGINS_SET, {
      id: 'google-calendar',
      enabled: true,
      config: { calendarId: 'primary' }
    })).resolves.to.deep.equal({
      id: 'google-calendar',
      enabled: true,
      config: { calendarId: 'primary' }
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.PLUGINS_SET, {
      enabled: true
    })

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates plugin runtime and program run payloads', async() => {
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.PLUGINS_RUN]: async(payload) => payload,
        [ELEPHANTNOTE_API_ACTIONS.PROGRAMS_RUN]: async(payload) => payload
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.PLUGINS_RUN, {
      id: 'mcp-memory',
      input: { name: 'rag.chat' }
    })).resolves.toMatchObject({ id: 'mcp-memory' })
    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.PROGRAMS_RUN, {
      id: 'python',
      command: 'pytest',
      cwd: '/tmp'
    })).resolves.toMatchObject({ id: 'python', command: 'pytest' })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.PROGRAMS_RUN, {
      id: 'python'
    })
    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates task run payloads', async() => {
    const handler = vi.fn(async(payload) => payload)
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.TASKS_RUN]: handler
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.TASKS_RUN, {
      id: 'daily-briefing'
    })).resolves.to.deep.equal({
      id: 'daily-briefing'
    })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.TASKS_RUN, {})

    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })

  it('validates RAG, MCP and model runtime payloads', async() => {
    const api = createElephantNoteApi({
      handlers: {
        [ELEPHANTNOTE_API_ACTIONS.RAG_CHAT]: async(payload) => payload,
        [ELEPHANTNOTE_API_ACTIONS.MCP_TOOLS_CALL]: async(payload) => payload,
        [ELEPHANTNOTE_API_ACTIONS.MODELS_DOWNLOAD]: async(payload) => payload
      }
    })

    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.RAG_CHAT, {
      message: 'What changed?',
      limit: 4
    })).resolves.toMatchObject({ message: 'What changed?', limit: 4 })
    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.MCP_TOOLS_CALL, {
      name: 'rag.chat',
      arguments: { message: 'Hello' }
    })).resolves.toMatchObject({ name: 'rag.chat' })
    await expect(api.call(ELEPHANTNOTE_API_ACTIONS.MODELS_DOWNLOAD, {
      id: 'llama-3.2'
    })).resolves.toEqual({ id: 'llama-3.2' })

    const response = await api.callEnvelope(ELEPHANTNOTE_API_ACTIONS.RAG_CHAT, {})
    expect(response.ok).to.equal(false)
    expect(response.error.code).to.equal('ELEPHANTNOTE_INVALID_API_PAYLOAD')
  })
})
