import {
  createApiCaller,
  isElephantNoteApiAvailable,
  requireElephantNoteApi
} from './elephantnoteClient/apiRuntime'
import { requireAtomicFeatureApi } from './elephantnoteClient/atomicFeatureApi'
import { createDomainClients } from './elephantnoteClient/domainClients'
import { COMPATIBILITY_CALLS } from './elephantnoteClient/compatibilityCalls'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

export { isElephantNoteApiAvailable }

const rawCall = createApiCaller(COMPATIBILITY_CALLS)
const VAULT_MUTATIONS = new Set([
  API.NOTES_CREATE,
  API.NOTES_WRITE,
  API.FOLDERS_CREATE,
  API.SIDEBAR_ATTACH,
  API.SIDEBAR_DETACH,
  API.ENTRIES_RENAME,
  API.ENTRIES_MOVE,
  API.ENTRIES_DELETE,
  API.WIKI_ACCEPT,
  API.WIKI_DISMISS,
  API.CALENDAR_IMPORT_GOOGLE,
  API.CALENDAR_IMPORT_GOOGLE_FROM_PATH,
  API.SOURCES_INGEST_URL,
  API.SOURCES_IMPORT_RSS
].filter(Boolean))

const call = async (action, payload = {}) => {
  const result = await rawCall(action, payload)
  if (VAULT_MUTATIONS.has(action)) {
    globalThis.window?.dispatchEvent?.(new CustomEvent('elephantnote:vault-mutated', {
      detail: { action }
    }))
  }
  return result
}

export const elephantnoteClient = {
  describe: () => requireElephantNoteApi().describe(),
  call,
  ...createDomainClients(call, requireAtomicFeatureApi)
}
