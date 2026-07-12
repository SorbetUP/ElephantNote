import path from 'path'
import { URL_REG, DATA_URL_REG, IMAGE_EXT_REG } from '../config'

export const getImageInfo = (src, baseUrl = window.DIRNAME) => {
  const imageExtension = IMAGE_EXT_REG.test(src)
  const isUrl = URL_REG.test(src) || (imageExtension && /^file:\/\/.+/.test(src))

  if (imageExtension) {
    const isAbsoluteLocal = /^(?:\/|\\\\|[a-zA-Z]:\\|[a-zA-Z]:\/).+/.test(src)
    if (isUrl || (!isAbsoluteLocal && !baseUrl)) {
      if (!isUrl && !baseUrl) console.warn('"baseUrl" is not defined!')
      return { isUnknownType: false, src }
    }
    return {
      isUnknownType: false,
      src: 'file://' + path.resolve(baseUrl, src)
    }
  } else if (isUrl && !imageExtension) {
    return { isUnknownType: true, src }
  }

  if (DATA_URL_REG.test(src)) {
    return { isUnknownType: false, src }
  }

  return { isUnknownType: false, src: '' }
}
