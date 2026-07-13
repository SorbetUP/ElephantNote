import ContentState from '../contentState'
import EventCenter from '../eventHandler/event'
import MouseEvent from '../eventHandler/mouseEvent'
import Clipboard from '../eventHandler/clipboard'
import Keyboard from '../eventHandler/keyboard'
import DragDrop from '../eventHandler/dragDrop'
import Resize from '../eventHandler/resize'
import ClickEvent from '../eventHandler/clickEvent'
import { MUYA_DEFAULT_OPTION } from '../config'
import { MuyaRustBridge } from '../rust/bridge'
import ToolTip from '../ui/tooltip'
import I18nCSS from '../utils/i18nCSS'
import { getContainer } from './container'

const installDispatchers = (muya) => {
  muya.dispatchChange = () => {
    const { eventCenter } = muya
    const markdown = (muya.markdown = muya.getMarkdown())
    const wordCount = muya.getWordCount(markdown)
    const cursor = muya.getCursor()
    const muyaIndexCursor = muya.contentState.getMuyaIndexCursor()
    const history = muya.getHistory()
    const toc = muya.getTOC()
    eventCenter.dispatch('change', { markdown, wordCount, cursor, muyaIndexCursor, history, toc })
  }

  muya.dispatchSelectionChange = (cursor) => {
    const selectionChanges = muya.contentState.selectionChange(cursor)
    if (!muya.container) return
    muya.eventCenter.dispatch('selectionChange', selectionChanges)
    muya.eventCenter.dispatch('scroll', { scrollTop: muya.container.scrollTop })
  }

  muya.dispatchSelectionFormats = (cursor) => {
    const { formats } = muya.contentState.selectionFormats(cursor)
    muya.eventCenter.dispatch('selectionFormats', formats)
  }
}

const initializeExperimentalRustEditor = (muya) => {
  const config = muya.options.experimentalRustEditor
  muya.rustEditorBridge = null
  muya.rustEditorReady = Promise.resolve(null)
  if (!config) return

  const reportError = (error) => {
    config.onError?.(error)
    muya.eventCenter.dispatch('rustEditorError', { error })
  }

  muya.rustEditorReady = Promise.resolve()
    .then(() => config.factory(muya.markdown))
    .then((engine) => {
      let bridge
      try {
        bridge = new MuyaRustBridge(engine, {
          applyPatches: config.applyPatches,
          applySnapshot: config.applySnapshot,
          onSelection: config.onSelection,
          onError: reportError
        })
      } catch (error) {
        reportError(error)
        return null
      }

      return bridge
        .snapshot()
        .then(() => {
          muya.rustEditorBridge = bridge
          muya.eventCenter.dispatch('rustEditorReady', {
            revision: bridge.revision,
            shadow: !config.applyPatches
          })
          return bridge
        })
        .catch(() => null)
    })
    .catch((error) => {
      reportError(error)
      return null
    })
}

export const initializeMuya = (muya, MuyaClass, container, options) => {
  muya.options = Object.assign({}, MUYA_DEFAULT_OPTION, options)
  const { markdown } = muya.options
  muya.markdown = markdown
  muya._markdownBlockCache = new Map()
  muya.container = getContainer(container, muya.options)
  muya.eventCenter = new EventCenter()
  muya.tooltip = new ToolTip(muya)

  for (const { plugin: Plugin, options: pluginOptions } of MuyaClass.plugins) {
    muya[Plugin.pluginName] = new Plugin(muya, pluginOptions)
  }

  muya.contentState = new ContentState(muya, muya.options)
  muya.clipboard = new Clipboard(muya)
  muya.clickEvent = new ClickEvent(muya)
  muya.keyboard = new Keyboard(muya)
  muya.dragdrop = new DragDrop(muya)
  muya.resize = new Resize(muya)
  muya.mouseEvent = new MouseEvent(muya)
  muya.i18nCSS = new I18nCSS(muya.options.t, muya.options.quickInsertTrigger)
  installDispatchers(muya)
  muya.init()
  initializeExperimentalRustEditor(muya)
}
