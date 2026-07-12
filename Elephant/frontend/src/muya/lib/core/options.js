import { CLASS_OR_ID } from '../config'

export default (Muya) => {
  Object.assign(Muya.prototype, {
    setFocusMode(bool) {
      const { container } = this
      const { focusMode } = this.options
      if (bool && !focusMode) container.classList.add(CLASS_OR_ID.AG_FOCUS_MODE)
      else container.classList.remove(CLASS_OR_ID.AG_FOCUS_MODE)
      this.options.focusMode = bool
    },

    setFont({ fontSize, lineHeight }) {
      if (fontSize) this.options.fontSize = parseInt(fontSize, 10)
      if (lineHeight) this.options.lineHeight = lineHeight
      this.contentState.render(false)
    },

    setTabSize(tabSize) {
      if (!tabSize || typeof tabSize !== 'number') tabSize = 4
      else if (tabSize < 1) tabSize = 1
      else if (tabSize > 4) tabSize = 4
      this.contentState.tabSize = tabSize
    },

    setListIndentation(listIndentation) {
      if (typeof listIndentation === 'number') {
        if (listIndentation < 1 || listIndentation > 4) listIndentation = 1
      } else if (listIndentation !== 'dfm') {
        listIndentation = 1
      }
      this.contentState.listIndentation = listIndentation
    },

    setOptions(options, needRender = false) {
      if (options.codeBlockLineNumbers) options.codeBlockLineNumbers = false
      Object.assign(this.options, options)
      if (needRender) this.contentState.render(false, true)

      const hideQuickInsertHint = options.hideQuickInsertHint
      if (typeof hideQuickInsertHint !== 'undefined') {
        const hasClass = this.container.classList.contains('ag-show-quick-insert-hint')
        if (hideQuickInsertHint && hasClass) {
          this.container.classList.remove('ag-show-quick-insert-hint')
        } else if (!hideQuickInsertHint && !hasClass) {
          this.container.classList.add('ag-show-quick-insert-hint')
        }
      }

      const spellcheckEnabled = options.spellcheckEnabled
      if (typeof spellcheckEnabled !== 'undefined') {
        this.container.setAttribute('spellcheck', !!spellcheckEnabled)
      }

      if (options.bulletListMarker) {
        this.contentState.turndownConfig.bulletListMarker = options.bulletListMarker
      }

      if (this.i18nCSS) {
        if (options.t) this.i18nCSS.setTranslationFunction(options.t)
        if (typeof options.quickInsertTrigger !== 'undefined') {
          this.i18nCSS.setQuickInsertTrigger(options.quickInsertTrigger)
        }
      }
    }
  })
}
