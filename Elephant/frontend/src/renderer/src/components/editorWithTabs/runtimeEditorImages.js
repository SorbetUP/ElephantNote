import {
  getImageBaseDirectory,
  normalizeInsertedImageSource
} from '@/util/imageSource'

import { createEditorImageAction } from './editorImageAction'

export const createRuntimeImageHandlers = ({
  currentFile,
  projectTree,
  preferencesStore,
  sourceCode,
  editorStore,
  dispatch,
  storeImage = null
}) => {
  const imageAction = storeImage || createEditorImageAction({
    getCurrentFile: () => currentFile.value || {},
    getProjectTree: () => projectTree.value,
    preferencesStore,
    isSourceCode: () => sourceCode.value
  })

  const insert = (image) => {
    const payload = typeof image === 'string' ? { src: image } : image || {}
    const baseDirectory = getImageBaseDirectory(
      currentFile.value?.pathname,
      window.DIRNAME
    )
    const source = normalizeInsertedImageSource(
      payload.src || payload.source || '',
      baseDirectory
    )
    return dispatch('insert-image', { ...payload, source })
  }

  const uploaded = (url, deletionUrl) => {
    const result = insert(url)
    editorStore.SHOW_IMAGE_DELETION_URL(deletionUrl)
    return result
  }

  const dropped = async (files) => {
    const image = Array.from(files || []).find((file) => /image/.test(file.type || ''))
    if (!image) return false
    const nativePath = window.tauri?.webUtils?.getPathForFile?.(image)
    const source = await imageAction(nativePath || image, null, image.name || '')
    if (!source) return false
    await insert({ source, alt: image.name || '' })
    return true
  }

  return { insert, uploaded, dropped }
}
