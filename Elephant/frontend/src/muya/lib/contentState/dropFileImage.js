import { getUniqueId, getImageInfo as getImageSrc } from '../utils'
import { getImageInfo } from '../utils/getImageInfo'
import { insertDroppedImageBlock } from './dropInsertion'

export const dropFileImage = async (contentState, files, dropAnchor) => {
  const image = Array.from(files).find(file => /image/.test(file.type))
  if (!image || !dropAnchor) return

  const { name } = image
  const path = window.tauri.webUtils.getPathForFile(image)
  const id = `loading-${getUniqueId()}`
  insertDroppedImageBlock(contentState, `![${id}](${path})`, dropAnchor)

  try {
    const newSrc = await contentState.muya.options.imageAction(path, id, name)
    const { src } = getImageSrc(path)
    if (src) contentState.stateRender.urlMap.set(newSrc, src)
    const imageWrapper = contentState.muya.container.querySelector(`span[data-id=${id}]`)
    if (imageWrapper) {
      contentState.replaceImage(getImageInfo(imageWrapper), { alt: name, src: newSrc })
    }
  } catch (error) {
    console.error('Unexpected error on image action:', error)
  }
}
