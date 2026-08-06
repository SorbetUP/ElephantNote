import {
  createApiCaller,
  describeElephantNoteApi,
  isElephantNoteApiAvailable,
  subscribeApiEvent
} from './elephantnoteClient/apiRuntime'
import { createDomainClients } from './elephantnoteClient/domainClients'

export { isElephantNoteApiAvailable }

const call = createApiCaller()

export const elephantnoteClient = {
  describe: describeElephantNoteApi,
  call,
  subscribe: subscribeApiEvent,
  ...createDomainClients(call, subscribeApiEvent)
}
