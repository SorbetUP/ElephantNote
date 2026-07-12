import { patch, h } from '../../parser/render/snabbdom'
import { renderPickerRows } from './renderCells'
import { renderPickerFooter } from './renderFooter'

export const renderTablePicker = picker => {
  const vnode = h('div', [
    h('div.checker', renderPickerRows(picker)),
    renderPickerFooter(picker)
  ])
  if (picker.oldVnode) patch(picker.oldVnode, vnode)
  else patch(picker.tableContainer, vnode)
  picker.oldVnode = vnode
}
