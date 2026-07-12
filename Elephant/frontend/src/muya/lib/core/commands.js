export default (Muya) => {
  Object.assign(Muya.prototype, {
    createTable(tableChecker) {
      return this.contentState.createTable(tableChecker)
    },

    updateParagraph(type) {
      this.contentState.updateParagraph(type)
    },

    duplicate() {
      this.contentState.duplicate()
    },

    deleteParagraph() {
      this.contentState.deleteParagraph()
    },

    insertParagraph(location, text = '', outMost = false) {
      this.contentState.insertParagraph(location, text, outMost)
    },

    editTable(data) {
      this.contentState.editTable(data)
    },

    format(type) {
      this.contentState.format(type)
    },

    insertImage(imageInfo) {
      this.contentState.insertImage(imageInfo)
    },

    search(value, opt) {
      const { selectHighlight } = opt
      this.contentState.search(value, opt)
      this.contentState.render(!!selectHighlight)
      return this.contentState.searchMatches
    },

    replace(value, opt) {
      this.contentState.replace(value, opt)
      this.contentState.render(false)
      return this.contentState.searchMatches
    },

    find(action) {
      this.contentState.find(action)
      this.contentState.render(false)
      return this.contentState.searchMatches
    },

    replaceWordInline(line, wordCursor, replacement, setCursor = false) {
      this.contentState.replaceWordInline(line, wordCursor, replacement, setCursor)
    },

    _replaceCurrentWordInlineUnsafe(word, replacement) {
      return this.contentState._replaceCurrentWordInlineUnsafe(word, replacement)
    }
  })
}
