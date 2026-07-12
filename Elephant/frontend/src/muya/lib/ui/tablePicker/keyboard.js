import { EVENT_KEYS } from '../../config'

export const updatePickerFromKeyboard = (picker, event, type) => {
  let number = +picker.select[type]
  const value = +event.target.value
  if (event.key === EVENT_KEYS.ArrowUp) number++
  else if (event.key === EVENT_KEYS.ArrowDown) number--
  else if (event.key === EVENT_KEYS.Enter) picker.selectItem()
  else if (typeof value === 'number') number = value - 1

  if (number !== +picker.select[type]) {
    picker.select[type] = Math.max(number, 0)
    picker.render()
  }
}
