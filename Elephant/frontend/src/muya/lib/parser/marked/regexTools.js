export const edit = function edit(regex, options) {
  regex = regex.source || regex
  options = options || ''
  return {
    replace(name, value) {
      value = value.source || value
      value = value.replace(/(^|[^\[])\^/g, '$1') // eslint-disable-line no-useless-escape
      regex = regex.replace(name, value)
      return this
    },
    getRegex() {
      return new RegExp(regex, options)
    }
  }
}

export const noop = function noop() {}
noop.exec = noop
