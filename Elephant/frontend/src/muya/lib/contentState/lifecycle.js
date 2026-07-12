export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    init() {
      const lastBlock = this.getLastBlock()
      const { key, text } = lastBlock
      const offset = text.length
      this.searchMatches = {
        value: '',
        matches: [],
        index: -1
      }
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: false,
        isInit: true
      }
    },

    getHistory() {
      const { stack, index, lastEditIndex } = this.history
      return { stack, index, lastEditIndex }
    },

    setHistory({ stack, index, lastEditIndex }) {
      Object.assign(this.history, { stack, index, pendingIndex: -1 })
      if (typeof lastEditIndex === 'number' && lastEditIndex >= -1 && lastEditIndex < stack.length) {
        this.history.lastEditIndex = lastEditIndex
      } else {
        this.history.updateFinalEditIndex()
      }
    },

    clear() {
      if (this.historyTimer) {
        clearTimeout(this.historyTimer)
        this.historyTimer = null
      }
      if (this.renderCodeBlockTimer) {
        clearTimeout(this.renderCodeBlockTimer)
        this.renderCodeBlockTimer = null
      }
      this.history.clearHistory()
    }
  })
}
