import {
  ELEPHANTNOTE_API_CONTRACT_ID,
  ELEPHANTNOTE_API_CONTRACT_REVISION,
  ELEPHANTNOTE_API_VERSION,
  listApiContracts
} from 'common/elephantnote/apiContractsV2'
import { createPlatformCompatibilityAdapter } from 'elephant-front/services/elephantnoteClient/platformCompatibilityAdapter'

const FACADE_MARKER = Symbol.for('elephantnote.tauri.api-contract-facade')

const errorEnvelope = (action, error) => ({
  ok: false,
  version: ELEPHANTNOTE_API_VERSION,
  action,
  error: {
    message: error?.message || String(error || 'ElephantNote API request failed.'),
    code: error?.code || 'ELEPHANTNOTE_API_ERROR'
  }
})

const successEnvelope = (action, data) => ({
  ok: true,
  version: ELEPHANTNOTE_API_VERSION,
  action,
  data
})

export const installTauriApiContractFacade = (target = globalThis) => {
  const bridge = target?.elephantnote
  if (!bridge) return false
  if (bridge.api?.[FACADE_MARKER]) return true

  const originalApi = bridge.api || {}
  const compatibility = createPlatformCompatibilityAdapter(target)
  const contractActions = listApiContracts().map(({ name }) => name)

  const describe = async() => {
    const backend = typeof originalApi.describe === 'function'
      ? await originalApi.describe().catch(() => ({}))
      : {}
    return {
      ...backend,
      runtime: backend.runtime || 'tauri',
      backend: backend.backend || 'rust',
      version: ELEPHANTNOTE_API_VERSION,
      backendVersion: backend.version || '',
      contractId: ELEPHANTNOTE_API_CONTRACT_ID,
      contractRevision: ELEPHANTNOTE_API_CONTRACT_REVISION,
      actions: [...new Set([...(backend.actions || []), ...contractActions])].sort()
    }
  }

  const call = async(action, payload = {}) => {
    try {
      if (compatibility.canHandle(action)) {
        return successEnvelope(action, await compatibility.call(action, payload))
      }
      if (typeof originalApi.call !== 'function') {
        const error = new Error(`ElephantNote Tauri API does not implement action: ${action}.`)
        error.code = 'ELEPHANTNOTE_UNKNOWN_API_ACTION'
        throw error
      }
      const response = await originalApi.call(action, payload)
      if (response?.ok === false || response?.ok === true) return response
      return successEnvelope(action, response)
    } catch (error) {
      return errorEnvelope(action, error)
    }
  }

  const api = {
    ...originalApi,
    describe,
    call,
    subscribe: (topic, listener) => compatibility.subscribe(topic, listener)
  }
  Object.defineProperty(api, FACADE_MARKER, { value: true })
  bridge.api = api
  return true
}
