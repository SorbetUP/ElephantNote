const clone = (value) => {
  if (value === undefined) return undefined
  return structuredClone(value)
}

export default class ElectronStoreStub {
  constructor(options = {}) {
    this.store = clone(options.defaults || {}) || {}
  }

  get(key, fallbackValue) {
    if (Object.prototype.hasOwnProperty.call(this.store, key)) return clone(this.store[key])
    return clone(fallbackValue)
  }

  set(key, value) {
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      for (const [entryKey, entryValue] of Object.entries(key)) this.store[entryKey] = clone(entryValue)
      return
    }
    this.store[key] = clone(value)
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key)
  }

  delete(key) {
    delete this.store[key]
  }

  clear() {
    this.store = {}
  }
}
