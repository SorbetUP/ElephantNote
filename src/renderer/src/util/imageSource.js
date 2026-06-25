import {
  getImageBaseDirectory,
  normalizeInsertedImageSource,
  resolveLocalImageSource,
  toFileUrl,
  toMarkdownImageSource as toSharedMarkdownImageSource
} from '../../../../Elephant/shared/imageSource.js'

const encodeMarkdownParentheses = (value = '') => String(value || '')
  .replace(/\(/g, '%28')
  .replace(/\)/g, '%29')

const toMarkdownImageSource = (src = '', baseDirectory = '') =>
  encodeMarkdownParentheses(toSharedMarkdownImageSource(src, baseDirectory))

export {
  getImageBaseDirectory,
  normalizeInsertedImageSource,
  resolveLocalImageSource,
  toFileUrl,
  toMarkdownImageSource
}
