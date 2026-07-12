import BaseFloat from '../baseFloat'
import './index.css'
import { updatePickerFromKeyboard } from './keyboard'
import { renderTablePicker } from './renderPicker'

class TablePicker extends BaseFloat {
  static pluginName = 'tablePicker'

  constructor(muya) {
    const name = 'ag-table-picker'
    super(muya, name)
    this.checkerCount = { row: 6, column: 8 }
    this.oldVnode = null
    this.current = null
    this.select = null
    const tableContainer = this.tableContainer = document.createElement('div')
    this.container.appendChild(tableContainer)
    this.listen()
  }

  listen() {
    const { eventCenter } = this.muya
    super.listen()
    eventCenter.subscribe('muya-table-picker', (data, reference, cb) => {
      if (!this.status) {
        this.show(data, reference, cb)
        this.render()
      } else {
        this.hide()
      }
    })
  }

  render() {
    renderTablePicker(this)
  }

  keyupHandler(event, type) {
    updatePickerFromKeyboard(this, event, type)
  }

  show(current, reference, cb) {
    this.current = this.select = current
    super.show(reference, cb)
  }

  selectItem() {
    const { cb } = this
    const { row, column } = this.select
    cb(Math.max(row, 0), Math.max(column, 0))
    this.hide()
  }
}

export default TablePicker
