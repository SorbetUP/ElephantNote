const isPlainObject = (value) => {
  if (value == null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export const toPlainObject = (value, seen = new WeakMap()) => {
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'symbol' || typeof value === 'function') return undefined
  if (value instanceof Date) return value.toISOString()
  if (value instanceof RegExp) return String(value)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || ''
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlainObject(item, seen)).filter((item) => item !== undefined)
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => [toPlainObject(key, seen), toPlainObject(item, seen)])
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => toPlainObject(item, seen)).filter((item) => item !== undefined)
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value)
  }
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value))
  }
  if (!isPlainObject(value)) {
    try {
      return toPlainObject(JSON.parse(JSON.stringify(value)), seen)
    } catch {
      return {}
    }
  }
  if (seen.has(value)) return seen.get(value)
  const output = {}
  seen.set(value, output)
  for (const [key, item] of Object.entries(value)) {
    const next = toPlainObject(item, seen)
    if (next !== undefined) {
      output[key] = next
    }
  }
  return output
}
