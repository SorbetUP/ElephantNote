import { getImageInfo } from '../../../utils'
import {
  renderImageContainer,
  renderImageElement
} from './image/renderElements'
import { renderImageIcons } from './image/renderIcons'
import {
  applyImageStateClasses,
  resolveImageSourceState
} from './image/sourceState'

export default function image(h, cursor, block, token, outerClass) {
  const imageInfo = getImageInfo(token.attrs.src)
  const { selectedImage } = this.muya.contentState
  const state = resolveImageSourceState(this, block, token, imageInfo)
  const wrapperSelector = applyImageStateClasses(
    state.wrapperSelector,
    state.src,
    state.isSuccess,
    selectedImage,
    block,
    token
  )
  const data = { dataset: state.dataset }
  const imageIcons = renderImageIcons(h)
  const { title } = token.attrs

  if (!state.src) {
    return [h(
      wrapperSelector,
      data,
      [...imageIcons, renderImageContainer(h, title)]
    )]
  }

  if (!state.isSuccess) {
    return [h(
      wrapperSelector,
      data,
      [...imageIcons, renderImageContainer(h, title)]
    )]
  }

  return [h(
    wrapperSelector,
    data,
    [
      ...imageIcons,
      renderImageContainer(
        h,
        title,
        [renderImageElement(h, token.attrs, state.domsrc)]
      )
    ]
  )]
}
