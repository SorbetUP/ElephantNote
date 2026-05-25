import { describe, expect, it } from 'vitest'
import {
  ATOMIC_MODEL_CATALOG,
  ATOMIC_PLUGIN_MANIFESTS,
  createDefaultModelSelection,
  getModelsByPurpose,
  normalizePluginManifest,
  normalizeProgrammaticTask
} from 'common/elephantnote/atomicWorkspace'

describe('Atomic workspace catalog', () => {
  it('groups built-in models by purpose', () => {
    expect(getModelsByPurpose('embedding').map((model) => model.id)).toContain('nomic-embed-text')
    expect(getModelsByPurpose('speech-to-text').map((model) => model.id)).toContain('whisper-large-v3-turbo')
    expect(getModelsByPurpose('unknown')).toEqual([])
  })

  it('creates a default model selection for every production model slot', () => {
    expect(createDefaultModelSelection(ATOMIC_MODEL_CATALOG)).toEqual({
      embedding: 'nomic-embed-text',
      chat: 'llama-3.2',
      tagging: 'mistral-small',
      wiki: 'llama-3.1-8b',
      'speech-to-text': 'whisper-large-v3-turbo',
      'text-to-speech': 'kokoro-82m'
    })
  })

  it('normalizes plugin manifests with explicit permissions and surfaces', () => {
    const manifest = normalizePluginManifest({
      id: 'google-calendar',
      name: 'Google Calendar',
      status: 'enabled',
      permissions: ['calendar:read', null, 'calendar:write'],
      surfaces: ['settings', 'calendar']
    })

    expect(manifest).toEqual({
      id: 'google-calendar',
      name: 'Google Calendar',
      status: 'enabled',
      permissions: ['calendar:read', 'calendar:write'],
      surfaces: ['settings', 'calendar']
    })
    expect(ATOMIC_PLUGIN_MANIFESTS.map((plugin) => plugin.id)).toContain('mcp-memory')
  })

  it('normalizes task templates into executable task manifests', () => {
    expect(normalizeProgrammaticTask({ template: 'daily-briefing' })).toEqual({
      id: 'daily-briefing',
      name: 'Daily briefing',
      cadence: 'daily',
      enabled: true,
      actions: ['search:recent', 'wiki:propose', 'calendar:summary']
    })
  })
})
