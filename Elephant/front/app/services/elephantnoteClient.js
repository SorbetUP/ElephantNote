import { createApiCaller, isElephantNoteApiAvailable, requireElephantNoteApi } from './elephantnoteClient/apiRuntime'
import { requireAtomicFeatureApi } from './elephantnoteClient/atomicFeatureApi'
import { createDomainClients } from './elephantnoteClient/domainClients'
import { LEGACY_CALLS } from './elephantnoteClient/legacyCalls'

export { isElephantNoteApiAvailable }

const call = createApiCaller(LEGACY_CALLS)

export const elephantnoteClient = {
  describe: () => requireElephantNoteApi().describe(),
  call,
  ...createDomainClients(call, requireAtomicFeatureApi)
}
