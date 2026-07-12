import { DEFAULT_TURNDOWN_CONFIG } from '../config'
import StateRender from '../parser/render'
import History from './history'

export const initializeContentState = (state, muya, options) => {
  const { bulletListMarker } = options

  state.muya = muya
  Object.assign(state, options)

  state.exemption = new Set()
  state.blocks = [state.createBlockP()]
  state.stateRender = new StateRender(muya)
  state.renderRange = [null, null]
  state.currentCursor = null
  state.selectedBlock = null
  state._selectedImage = null
  state.dropAnchor = null
  state.prevCursor = null
  state.historyTimer = null
  state.renderCodeBlockTimer = null
  state.history = new History(state)
  state.turndownConfig = Object.assign({}, DEFAULT_TURNDOWN_CONFIG, { bulletListMarker })

  state.dragInfo = null
  state.isDragTableBar = false
  state.dragEventIds = []

  state.cellSelectInfo = null
  state._selectedTableCells = null
  state.cellSelectEventIds = []

  state.init()
}
