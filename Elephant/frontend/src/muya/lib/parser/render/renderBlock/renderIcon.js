import { h } from '../snabbdom'
import { CLASS_OR_ID } from '../../../config'
import { resolveBlockIcon } from './icon/resolveIcon'
import {
  renderBlockTypeIcon,
  renderHeaderLinkIcon
} from './icon/renderIconVnodes'

export default function renderIcon(block, t) {
  if (block.parent) console.error(t('editor.onlyTopBlockCanRenderIcon'))
  const { icon, isCopyLink } = resolveBlockIcon(block, t)
  const iconVnode = renderBlockTypeIcon(icon)
  const icons = isCopyLink
    ? [iconVnode, renderHeaderLinkIcon()]
    : [iconVnode]

  return h(
    `a.${CLASS_OR_ID.AG_FRONT_ICON}`,
    { attrs: { contenteditable: 'false' } },
    icons
  )
}
