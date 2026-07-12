import { patch, h } from '../../parser/render/snabbdom'

const createItemVnode = (quickInsert, item, activeItem) => {
  const { title, subTitle, label, icon, shortCut } = item
  const iconVnode = h(
    'div.icon-container',
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
  const description = h('div.description', [
    h('div.big-title', title),
    h('div.sub-title', subTitle)
  ])
  const shortCutVnode = h('div.short-cut', [h('span', shortCut)])
  const selector = activeItem.label === label ? 'div.item.active' : 'div.item'

  return h(
    selector,
    {
      dataset: { label },
      on: {
        click: () => {
          quickInsert.selectItem(item)
        }
      }
    },
    [iconVnode, description, shortCutVnode]
  )
}

export const renderQuickInsert = (quickInsert) => {
  const { scrollElement, activeItem, _renderObj } = quickInsert
  let children = Object.keys(_renderObj)
    .filter((key) => _renderObj[key].length !== 0)
    .map((key) => {
      const titleVnode = h('div.title', key.toUpperCase())
      const items = _renderObj[key].map((item) => createItemVnode(quickInsert, item, activeItem))
      return h('section', [titleVnode, ...items])
    })

  if (children.length === 0) {
    children = h('div.no-result', 'No result')
  }
  const vnode = h('div', children)

  if (quickInsert.oldVnode) {
    patch(quickInsert.oldVnode, vnode)
  } else {
    patch(scrollElement, vnode)
  }
  quickInsert.oldVnode = vnode
}
