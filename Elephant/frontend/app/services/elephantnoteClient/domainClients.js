import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

const directoryListPayload = (payload = '') =>
  typeof payload === 'string' ? { relativePath: payload } : payload

export const createDomainClients = (call, requireAtomicFeatureApi) => ({
  vaults: {
    get: () => call(API.VAULTS_GET),
    select: () => call(API.VAULTS_SELECT),
    setActive: (vaultId) => call(API.VAULTS_SET_ACTIVE, { vaultId }),
    setIcon: (vaultId, icon) => call(API.VAULTS_SET_ICON, { vaultId, icon }),
    setName: (vaultId, name) => call(API.VAULTS_SET_NAME, { vaultId, name }),
    remove: (vaultId) => call(API.VAULTS_REMOVE, { vaultId })
  },
  directory: {
    list: (payload = '') => call(API.DIRECTORY_LIST, directoryListPayload(payload))
  },
  notes: {
    create: (payload = '') => {
      if (typeof payload === 'string') {
        return call(API.NOTES_CREATE, { relativePath: payload })
      }
      return call(API.NOTES_CREATE, payload)
    },
    read: (relativePath) =>
      call(API.NOTES_READ, typeof relativePath === 'string' ? { relativePath } : relativePath),
    write: (payload = {}) => call(API.NOTES_WRITE, payload)
  },
  folders: {
    create: (relativePath = '') => call(API.FOLDERS_CREATE, { relativePath })
  },
  sidebar: {
    attach: (payload) => call(API.SIDEBAR_ATTACH, payload),
    detach: (relativePath) => call(API.SIDEBAR_DETACH, { relativePath })
  },
  entries: {
    rename: (payload) => call(API.ENTRIES_RENAME, payload),
    move: (payload) => call(API.ENTRIES_MOVE, payload),
    delete: (relativePath) => call(API.ENTRIES_DELETE, { relativePath })
  },
  search: {
    query: (params) => call(API.SEARCH_QUERY, params),
    status: () => call(API.SEARCH_STATUS)
  },
  features: {
    get: () => call(API.FEATURES_GET),
    set: (key, enabled) => call(API.FEATURES_SET, { key, enabled })
  },
  atomic: {
    getCatalog: () => call(API.ATOMIC_CATALOG_GET)
  },
  atomicFeatures: {
    describeApi: () => requireAtomicFeatureApi().describeApi(),
    callApi: (action, args = {}) => requireAtomicFeatureApi().callApi({ action, arguments: args }),
    providers: () => requireAtomicFeatureApi().providers()
  }
})
