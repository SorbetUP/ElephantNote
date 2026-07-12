import { h } from '../../snabbdom'
import { formatLink } from './iconAssets'

const renderImage = src => h(
  'img.icon-inner',
  { attrs: { src } },
  ''
)

export const renderBlockTypeIcon = icon => h(
  'i.icon.ag-front-icon-button',
  renderImage(icon)
)

export const renderHeaderLinkIcon = () => h(
  'i.icon.ag-copy-header-link',
  { style: { left: '-30px' } },
  renderImage(formatLink)
)
