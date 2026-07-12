import { arrowHandler, docArrowHandler } from './arrowHandlers'
import { findNextRowCell, findPrevRowCell } from './arrowTableNavigation'

const arrowCtrl = (ContentState) => {
  ContentState.prototype.findNextRowCell = findNextRowCell
  ContentState.prototype.findPrevRowCell = findPrevRowCell
  ContentState.prototype.docArrowHandler = docArrowHandler
  ContentState.prototype.arrowHandler = arrowHandler
}

export default arrowCtrl
