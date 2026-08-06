import { toPlainObject } from '../../../../shared/plainObject.js'
import {
  ELEPHANTNOTE_API_CONTRACT_ID,
  ELEPHANTNOTE_API_CONTRACT_REVISION,
  ELEPHANTNOTE_API_VERSION,
  listApiContracts,
  validateApiPayload
} from 'common/elephantnote/apiContractsV2'
import { platformCompatibilityAdapter } from './platformCompatibilityAdapter'

const getBridge = () => globalThis.window?.elephantnote

const legacyMapAdapter = (calls = {}) => ({
  canHandle: (action) => typeof calls[action] === 'function',
  call: (action, payload) => calls[action](payload),
  subscribe: () => () => {}
})

const normalizeCompatibilityAdapter = (candidate) => {
  if (!candidate) return platformCompatibilityAdapter
  if (typeof candidate.canHandle === 'function' && typeof candidate.call === 'function') {
    return candidate
  }
  return legacyMapAdapter(candidate)
}

const isUnknownOrUnavailableAction = (error) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return (
    code === 'ELEPHANTNOTE_UNKNOWN_API_ACTION' ||
    code === 'ELEPHANTNOTE_COMPATIBILITY_METHOD_UNAVAILABLE' ||
    /unknown elephantnote api action/i.test(message) ||
    /does not implement api action/i.test(message)
  )
}

export const requireElephantNoteApi = () => {
  const api = getBridge()?.api
  if (!api?.call) {
    throw new Error('ElephantNote API is not available in this renderer context.')
  }
  return api
}

export const isElephantNoteApiAvailable = () => !!getBridge()?.api?.call

export const unwrapApiEnvelope = async(promise) => {
  const response = await promise
  if (response?.ok === false) {
    const error = new Error(response.error?.message || 'ElephantNote API request failed.')
    error.code = response.error?.code || 'ELEPHANTNOTE_API_ERROR'
    throw error
  }
  return response?.data ?? response
}

const validateForTransport = (action, payload, compatibilityAdapter) => {
  try {
    return validateApiPayload(action, payload)
  } catch (error) {
    if (error?.code === 'ELEPHANTNOTE_UNKNOWN_API_ACTION' && compatibilityAdapter.canHandle(action)) {
      return payload
    }
    throw error
  }
}

export const createApiCaller = (compatibility = platformCompatibilityAdapter) => {
  const compatibilityAdapter = normalizeCompatibilityAdapter(compatibility)

  return async(action, payload = {}) => {
    const plainPayload = toPlainObject(payload)
    const validatedPayload = validateForTransport(action, plainPayload, compatibilityAdapter)

    if (isElephantNoteApiAvailable()) {
      try {
        return await unwrapApiEnvelope(requireElephantNoteApi().call(action, validatedPayload))
      } catch (error) {
        if (!compatibilityAdapter.canHandle(action) || !isUnknownOrUnavailableAction(error)) {
          throw error
        }
      }
    }

    if (!compatibilityAdapter.canHandle(action)) {
      throw new Error(`ElephantNote API is not available for action: ${action}`)
    }
    return compatibilityAdapter.call(action, validatedPayload)
  }
}

export const describeElephantNoteApi = async() => {
  const contractActions = listApiContracts().map(({ name }) => name)
  const backend = isElephantNoteApiAvailable() && typeof requireElephantNoteApi().describe === 'function'
    ? await requireElephantNoteApi().describe()
    : {}
  return {
    ...backend,
    version: backend.version || ELEPHANTNOTE_API_VERSION,
    contractId: ELEPHANTNOTE_API_CONTRACT_ID,
    contractRevision: ELEPHANTNOTE_API_CONTRACT_REVISION,
    actions: [...new Set([...(backend.actions || []), ...contractActions])].sort()
  }
}

export const subscribeApiEvent = (topic, listener, compatibility = platformCompatibilityAdapter) => {
  const api = getBridge()?.api
  if (typeof api?.subscribe === 'function') return api.subscribe(topic, listener)
  return normalizeCompatibilityAdapter(compatibility).subscribe?.(topic, listener) || (() => {})
}
