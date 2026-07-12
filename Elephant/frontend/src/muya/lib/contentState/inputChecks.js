import { tokenizer } from '../parser/'

const normalizeQuickInsertTrigger = trigger => {
  return typeof trigger === 'string' && trigger.trim() ? trigger.trim().charAt(0) : '/'
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const inputChecks = ContentState => {
  ContentState.prototype.checkQuickInsert = function(block) {
    const { type, text, functionType } = block
    if (type !== 'span' || functionType !== 'paragraphContent') return false
    const trigger = normalizeQuickInsertTrigger(this.muya.options.quickInsertTrigger)
    return new RegExp(`^${escapeRegExp(trigger)}\\S*$`).test(text)
  }

  ContentState.prototype.checkCursorInTokenType = function(functionType, text, offset, type) {
    if (!/atxLine|paragraphContent|cellContent/.test(functionType)) return false
    const tokens = tokenizer(text, {
      hasBeginRules: false,
      options: this.muya.options
    })
    return tokens
      .filter(token => token.type === type)
      .some(token => offset >= token.range.start && offset <= token.range.end)
  }

  ContentState.prototype.checkNotSameToken = function(functionType, oldText, text) {
    if (!/atxLine|paragraphContent|cellContent/.test(functionType)) return false
    const oldTokens = tokenizer(oldText, { options: this.muya.options })
    const tokens = tokenizer(text, { options: this.muya.options })
    const oldCache = {}
    const cache = {}

    for (const { type } of oldTokens) oldCache[type] = oldCache[type] ? oldCache[type] + 1 : 1
    for (const { type } of tokens) cache[type] = cache[type] ? cache[type] + 1 : 1
    if (Object.keys(oldCache).length !== Object.keys(cache).length) return true
    for (const key of Object.keys(oldCache)) {
      if (!cache[key] || oldCache[key] !== cache[key]) return true
    }
    return false
  }
}

export default inputChecks
