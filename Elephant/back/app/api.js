import { validateApiPayload } from './apiSchemas'
import { ELEPHANTNOTE_API_ACTIONS, ELEPHANTNOTE_API_VERSION } from 'common/elephantnote/apiActions'
export {
  ELEPHANTNOTE_API_ACTIONS,
  ELEPHANTNOTE_API_DOMAINS,
  ELEPHANTNOTE_API_VERSION,
  listApiContracts
} from 'common/elephantnote/apiActions'

const normalizeAction = (action) => String(action || '').trim()

export const createApiResponse = ({ ok, action, data, error }) => ({
  ok,
  version: ELEPHANTNOTE_API_VERSION,
  action,
  data: ok
    ? data
    : undefined,
  error: ok
    ? undefined
    : {
      message: error?.message || String(error || 'API request failed.'),
      code: error?.code || 'ELEPHANTNOTE_API_ERROR'
    }
})

export const createElephantNoteApi = ({ handlers = {} } = {}) => {
  const registry = new Map(Object.entries(handlers))

  const describe = () => ({
    version: ELEPHANTNOTE_API_VERSION,
    actions: [...registry.keys()].sort()
  })

  registry.set(ELEPHANTNOTE_API_ACTIONS.API_DESCRIBE, async() => describe())

  const call = async(actionName, payload = {}, context = {}) => {
    const action = normalizeAction(actionName)
    const handler = registry.get(action)
    if (!handler) {
      const error = new Error(`Unknown ElephantNote API action: ${action || '(empty)'}.`)
      error.code = 'ELEPHANTNOTE_UNKNOWN_API_ACTION'
      throw error
    }
    return handler(validateApiPayload(action, payload), context)
  }

  const callEnvelope = async(actionName, payload = {}, context = {}) => {
    const action = normalizeAction(actionName)
    try {
      return createApiResponse({
        ok: true,
        action,
        data: await call(action, payload, context)
      })
    } catch (error) {
      return createApiResponse({ ok: false, action, error })
    }
  }

  return {
    version: ELEPHANTNOTE_API_VERSION,
    describe,
    call,
    callEnvelope,
    hasAction: (actionName) => registry.has(normalizeAction(actionName)),
    listActions: () => [...registry.keys()].sort()
  }
}

export const registerElephantNoteApiIpc = ({ ipcMain, api }) => {
  ipcMain.handle('elephantnote:api:describe', async() => api.describe())
  ipcMain.handle('elephantnote:api:call', async(event, request = {}) => {
    return api.callEnvelope(request.action, request.payload || {}, {
      event,
      windowId: request.windowId || request.payload?.windowId
    })
  })
}
