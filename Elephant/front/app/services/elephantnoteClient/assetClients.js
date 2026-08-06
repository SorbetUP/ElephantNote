import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiContractsV2'
import { toPlainObject } from '../../../../shared/plainObject.js'

export const createAssetClients = (call) => ({
  attachments: {
    list: () => call(API.ATTACHMENTS_LIST),
    writeText: (relativePath, content = '') =>
      call(API.ATTACHMENTS_WRITE_TEXT, {
        relativePath: String(relativePath || ''),
        content: String(content ?? '')
      })
  },
  drawings: {
    list: () => call(API.DRAWINGS_LIST),
    create: (title = '') =>
      call(API.DRAWINGS_CREATE, title ? { title: String(title) } : {}),
    read: (relativePath) =>
      call(API.DRAWINGS_READ, { relativePath: String(relativePath || '') }),
    write: (relativePath, scene = {}) =>
      call(API.DRAWINGS_WRITE, {
        relativePath: String(relativePath || ''),
        scene: toPlainObject(scene)
      })
  }
})
