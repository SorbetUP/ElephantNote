const getBridge = () => globalThis.window?.elephantnote

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

export const createApiCaller = (legacyCalls = {}) => (action, payload = {}) => {
  if (isElephantNoteApiAvailable()) {
    return unwrapApiEnvelope(requireElephantNoteApi().call(action, payload))
  }

  const legacyCall = legacyCalls[action]
  if (!legacyCall) {
    throw new Error(`ElephantNote API is not available for action: ${action}`)
  }
  return legacyCall(payload)
}
