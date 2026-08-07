import {
  getImageBaseDirectory,
  normalizeInsertedImageSource
} from '@/util/imageSource'

import { createEditorImageAction } from './editorImageAction'

const REMOTE_URL_REG = /^(?:https?:|data:|blob:)/i
const IMAGE_EXT_REG = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#].*)?$/i

const markDroppedUserMutation = (reason) => {
  globalThis.__ELEPHANT_ACTIVE_MUYA__?.__onUserMutation?.(reason)
}

export const checkRuntimeImageContentType = async (source, fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== 'function') return false
  try {
    const response = await fetchImpl(source, { method: 'HEAD' })
    const contentType = response?.headers?.get?.('content-type') || ''
    return /^image\//i.test(contentType)
  } catch {
    return false
  }
}

export const isRuntimeImageUrl = async (source, fetchImpl = globalThis.fetch) => {
  const value = String(source || '').trim()
  if (!REMOTE_URL_REG.test(value)) return false
  return IMAGE_EXT_REG.test(value) || checkRuntimeImageContentType(value, fetchImpl)
}

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
  const isImageUrl = validateImageUrl || isRuntimeImageUrl

  const normalizeSource = (source) => {
    const baseDirectory = getImageBaseDirectory(
      currentFile.value?.pathname,
      window.DIRNAME
    )
    return normalizeInsertedImageSource(source || '', baseDirectory)
  }

  const insert = (image) => {
    const payload = typeof image === 'string' ? { src: image } : image || {}
    const source = normalizeSource(payload.src || payload.source)
    if (!String(source || '').trim()) throw new Error('Dropped image source is empty')
    return dispatch('insert-image', {
      ...payload,
      source
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
    markDroppedUserMutation('drop:image')
    const nativePath = window.tauri?.webUtils?.getPathForFile?.(image) || image?.path || ''
    const source = await imageAction(nativePath || image, null, image.name || '')
    if (!String(source || '').trim()) {
      throw new Error(`Unable to resolve dropped image ${image.name || '<unnamed>'} to a non-empty source`)
    }
    await insert({ source, alt: image.name || '' })
    return true
  }

  const uriDropped = async (source) => {
    if (!await isImageUrl(source)) return false
    markDroppedUserMutation('drop:image-uri')
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
