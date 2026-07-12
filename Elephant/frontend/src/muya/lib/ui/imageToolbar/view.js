import { patch, h } from '../../parser/render/snabbdom'
import getIcons from './config'

const createIconWrapper = (item) => {
  if (!item.icon) return h(undefined, undefined)
  const icon = h(
    'i.icon',
    h(
      'i.icon-inner',
      {
        style: {
          background: `url(${item.icon}) no-repeat`,
          'background-size': '100%'
        }
      },
      ''
    )
  )
  return h('div.icon-wrapper', icon)
}

export const renderImageToolbar = (toolbar) => {
  const { muya, oldVnode, toolbarContainer, imageInfo } = toolbar
  const icons = getIcons(muya?.options?.t)
  const { attrs } = imageInfo.token
  const dataAlign = attrs['data-align']
  const isLocalImage = toolbar.isLocalFile(imageInfo)
  const canEditWithExcalidraw = toolbar.canEditWithExcalidraw(imageInfo)
  const children = icons
    .filter((item) => {
      if (item.type === 'edit-excalidraw') return canEditWithExcalidraw
      return !item.localOnly || isLocalImage
    })
    .map((item) => {
      let itemSelector = `li.item.${item.type}`
      if (item.type === 'open' || item.type === 'edit-excalidraw') {
        itemSelector += isLocalImage ? '.enable' : '.disable'
      }
      if (item.type === dataAlign || (!dataAlign && item.type === 'inline')) {
        itemSelector += '.active'
      }
      return h(
        itemSelector,
        {
          dataset: {
            tip: item.tooltip
          },
          on: {
            click: (event) => {
              toolbar.selectItem(event, item)
            }
          }
        },
        [h('div.tooltip', item.tooltip), createIconWrapper(item)]
      )
    })

  const vnode = h('ul', children)
  if (oldVnode) {
    patch(oldVnode, vnode)
  } else {
    patch(toolbarContainer, vnode)
  }
  toolbar.oldVnode = vnode
}
