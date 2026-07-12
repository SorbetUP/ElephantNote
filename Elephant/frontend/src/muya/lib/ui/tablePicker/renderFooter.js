import { h } from '../../parser/render/snabbdom'

const renderDimensionInput = (picker, type) => h(`input.${type}-input`, {
  props: {
    type: 'text',
    value: +picker.select[type] + 1
  },
  on: {
    keyup: event => picker.keyupHandler(event, type)
  }
})

export const renderPickerFooter = picker => h('div.footer', [
  renderDimensionInput(picker, 'row'),
  'x',
  renderDimensionInput(picker, 'column'),
  h('button', { on: { click: _ => picker.selectItem() } }, 'OK')
])
