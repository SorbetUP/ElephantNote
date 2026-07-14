import { IMAGE_EXT_REG, URL_REG } from 'muya/lib/config'
import { checkImageContentType } from 'muya/lib/utils'

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
  storeImage = null,
  validateImageUrl = null
}) => {
  const imageAction = storeImage || createEditorImageAction({
    getCurrentFile: () => currentFile.value || {},
    getProjectTree: () => projectTree.value,
    preferencesStore,
    isSourceCode: () => sourceCode.value
  })
  const isImageUrl = validateImageUrl || (async (source) => {
    if (!URL_REG.test(source)) return false
    return IMAGE_EXT_REG.test(source) || checkImageContentType(source)
  })

  const normalizeSource = (source) => {
    const baseDirectory = getImageBaseDirectory(
      currentFile.value?.pathname,
      window.DIRNAME
    )
    return normalizeInsertedImageSource(source || '', baseDirectory)
  }

  const insert = (image) => {
    const payload = typeof image === 'string' ? { src: image } : image || {}
    return dispatch('insert-image', {
      ...payload,
      source: normalizeSource(payload.src || payload.source)
    })
  }

  const replace = (image) => dispatch('replace-image', {
    ...image,
    source: normalizeSource(image?.src || image?.source)
  })

  const remove = (image) => dispatch('delete-image', {
    image: typeof image === 'object' ? image.image : image
  })

  const chooseReplacement = async (image) => {
    const source = await editorStore.ASK_FOR_IMAGE_PATH()
    if (!source) return false
    await replace({ ...image, source })
    return true
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

  const uriDropped = async (source) => {
    if (!await isImageUrl(source)) return false
    await insert({ source, alt: '' })
    return true
  }

  return {
    insert,
    replace,
    remove,
    chooseReplacement,
    uploaded,
    dropped,
    uriDropped
  }
}
