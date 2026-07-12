import { patch, h } from '../../parser/render/snabbdom'

const MAX_SUBMENU_HEIGHT = 400
const ITEM_HEIGHT = 28
const PADDING = 10

const createIconWrapper = ({ icon, label }) => h(
  'div.icon-wrapper',
  h(
    'i.icon',
    h(
      `i.icon-${label.replace(/\s/g, '-')}`,
      {
        style: {
          background: `url(${icon}) no-repeat`,
          'background-size': '100%'
        }
      },
      ''
    )
  )
)

export const renderFrontSubMenu = (frontMenu, subMenu) => {
  const rect = frontMenu.reference.getBoundingClientRect()
  const windowHeight = document.documentElement.clientHeight
  const children = subMenu.map((menuItem) => {
    const { title, label, shortCut } = menuItem
    const textWrapper = h('span', title)
    const shortCutWrapper = h('div.short-cut', [h('span', shortCut)])
    let itemSelector = `li.item.${label}`
    if (label === frontMenu.getLabel(frontMenu.outmostBlock)) {
      itemSelector += '.active'
    }
    return h(
      itemSelector,
      {
        on: {
          click: (event) => {
            frontMenu.selectItem(event, { label })
          }
        }
      },
      [createIconWrapper(menuItem), textWrapper, shortCutWrapper]
    )
  })
  let subMenuSelector = 'div.submenu'
  if (windowHeight - rect.bottom < MAX_SUBMENU_HEIGHT - (ITEM_HEIGHT + PADDING)) {
    subMenuSelector += '.align-bottom'
  }
  return h(subMenuSelector, h('ul', children))
}

export const renderFrontMenu = (frontMenu) => {
  const { oldVnode, frontMenuContainer, outmostBlock, startBlock, endBlock } = frontMenu
  const { type, functionType } = outmostBlock
  const children = frontMenu.menu.map((menuItem) => {
    const { label, text, shortCut } = menuItem
    const subMenu = frontMenu.getSubMenu(outmostBlock, startBlock, endBlock)
    const textWrapper = h('span', text)
    const shortCutWrapper = h('div.short-cut', [h('span', shortCut)])
    let itemSelector = `li.item.${label}`
    const itemChildren = [createIconWrapper(menuItem), textWrapper, shortCutWrapper]
    if (label === 'turnInto' && subMenu.length !== 0) {
      itemChildren.push(frontMenu.renderSubMenu(subMenu))
    }
    if (label === 'turnInto' && subMenu.length === 0) {
      itemSelector += '.disabled'
    }
    if (label === 'duplicate' && type === 'pre' && functionType === 'frontmatter') {
      itemSelector += '.disabled'
    }
    return h(
      itemSelector,
      {
        on: {
          click: (event) => {
            frontMenu.selectItem(event, { label })
          }
        }
      },
      itemChildren
    )
  })

  const vnode = h('ul', children)
  if (oldVnode) {
    patch(oldVnode, vnode)
  } else {
    patch(frontMenuContainer, vnode)
  }
  frontMenu.oldVnode = vnode
}
