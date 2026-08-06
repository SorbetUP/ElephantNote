import { describe, expect, it } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  ELEPHANTNOTE_API_CONTRACT_REVISION,
  ELEPHANTNOTE_API_EVENT_TOPICS,
  ELEPHANTNOTE_API_VERSION,
  listApiContracts,
  validateApiPayload
} from 'common/elephantnote/apiContractsV2'

describe('ElephantNote API v2 contract', () => {
  it('publishes a unique canonical action registry', () => {
    const contracts = listApiContracts()
    const names = contracts.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
    expect(ELEPHANTNOTE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ELEPHANTNOTE_API_CONTRACT_REVISION).toBe(2)
  })

  it('exposes provider-neutral calendar and model actions', () => {
    expect(API.CALENDAR_IMPORT).toBe('calendar.import')
    expect(API.CALENDAR_SYNC).toBe('calendar.sync')
    expect(API.MODELS_SEARCH).toBe('models.search')
    expect(API.MODELS_ACQUIRE).toBe('models.acquire')
    expect(API.MODELS_DELETE).toBe('models.delete')
  })

  it('exposes Atomic features through the same contract', () => {
    expect(API.ATOMIC_API_DESCRIBE).toBe('atomic.api.describe')
    expect(API.ATOMIC_GRAPH).toBe('atomic.graph')
    expect(API.ATOMIC_MODELS_PULL).toBe('atomic.models.pull')
  })

  it('validates provider-neutral calendar payloads', () => {
    expect(validateApiPayload(API.CALENDAR_IMPORT, {
      provider: 'google',
      sourcePath: '/tmp/calendar.ics'
    })).toEqual({ provider: 'google', sourcePath: '/tmp/calendar.ics' })

    expect(() => validateApiPayload(API.CALENDAR_IMPORT, {})).toThrow(/provider/i)
  })

  it('requires a stable model identifier for state-changing actions', () => {
    expect(validateApiPayload(API.MODELS_ACQUIRE, {
      provider: 'huggingface',
      repoId: 'org/model'
    })).toMatchObject({ repoId: 'org/model' })

    expect(() => validateApiPayload(API.MODELS_ACQUIRE, {
      provider: 'huggingface'
    })).toThrow(/identifier/i)
  })

  it('keeps event topics transport independent', () => {
    expect(ELEPHANTNOTE_API_EVENT_TOPICS.MODELS_DOWNLOAD_PROGRESS)
      .toBe('models.download.progress')
    expect(ELEPHANTNOTE_API_EVENT_TOPICS.ATOMIC_MODEL_PULL_PROGRESS)
      .toBe('atomic.models.pull.progress')
  })
})
