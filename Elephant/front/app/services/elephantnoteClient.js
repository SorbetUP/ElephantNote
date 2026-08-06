import {
  createApiCaller,
  describeElephantNoteApi,
  isElephantNoteApiAvailable,
  subscribeApiEvent
} from './elephantnoteClient/apiRuntime'
import { createAssetClients } from './elephantnoteClient/assetClients'
import { createDomainClients } from './elephantnoteClient/domainClients'
import { createEditorEngineClients } from './elephantnoteClient/editorEngineClients'

export { isElephantNoteApiAvailable }

const call = createApiCaller()

export const elephantnoteClient = {
  describe: describeElephantNoteApi,
  call,
  subscribe: subscribeApiEvent,
  ...createDomainClients(call, subscribeApiEvent),
  ...createEditorEngineClients(call),
  ...createAssetClients(call)
}
