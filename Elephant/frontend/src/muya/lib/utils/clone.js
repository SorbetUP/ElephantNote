export const deepCopyArray = (array) => {
  const result = []
  const len = array.length
  let index
  for (index = 0; index < len; index += 1) {
    const value = array[index]
    if (typeof value === 'object' && value !== null) {
      result.push(Array.isArray(value) ? deepCopyArray(value) : deepCopy(value))
    } else {
      result.push(value)
    }
  }
  return result
}

export const deepCopy = (object) => {
  const result = {}
  Object.keys(object).forEach((key) => {
    const value = object[key]
    if (typeof value === 'object' && value !== null) {
      result[key] = Array.isArray(value) ? deepCopyArray(value) : deepCopy(value)
    } else {
      result[key] = value
    }
  })
  return result
}

export const deepClone = (object) => JSON.parse(JSON.stringify(object))
