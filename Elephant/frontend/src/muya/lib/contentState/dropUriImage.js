import { URL_REG, IMAGE_EXT_REG } from '../config'
import { checkImageContentType } from '../utils'
import { insertDroppedImageBlock } from './dropInsertion'

export const dropUriImage = (contentState, item, dropAnchor) => {
  if (item.kind !== 'string' || item.type !== 'text/uri-list') return
  item.getAsString(async str => {
    if (!URL_REG.test(str) || !dropAnchor) return
    let isImage = IMAGE_EXT_REG.test(str)
    if (!isImage) isImage = await checkImageContentType(str)
    if (!isImage) return

    insertDroppedImageBlock(contentState, `![](${str})`, dropAnchor)
    contentState.muya.eventCenter.dispatch('stateChange')
  })
}
