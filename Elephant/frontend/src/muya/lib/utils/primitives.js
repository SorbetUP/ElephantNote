export const isMetaKey = ({ key }) =>
  key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta'

export const noop = () => {}
export const identity = (value) => value
export const isOdd = (number) => Math.abs(number) % 2 === 1
export const isEven = (number) => Math.abs(number) % 2 === 0
export const isLengthEven = (value = '') => value.length % 2 === 0

export const snakeToCamel = (name) =>
  name.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())

export const camelToSnake = (name) =>
  name.replace(/([A-Z])/g, (match, letter) => `-${letter.toLowerCase()}`)

export const conflict = (first, second) => {
  return !(first[1] < second[0] || second[1] < first[0])
}

export const union = (
  { start: targetStart, end: targetEnd },
  { start: localStart, end: localEnd, active }
) => {
  if (targetEnd <= localStart || localEnd <= targetStart) return null
  if (localStart < targetStart) {
    return {
      start: targetStart,
      end: targetEnd < localEnd ? targetEnd : localEnd,
      active
    }
  }
  return {
    start: localStart,
    end: targetEnd < localEnd ? targetEnd : localEnd,
    active
  }
}
