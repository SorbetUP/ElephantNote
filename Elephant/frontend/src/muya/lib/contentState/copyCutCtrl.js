import { docCutHandler, cutHandler } from './copyCutDelete'
import getClipBoardData from './clipboardSelectionData'
import docCopyHandler from './copyTableCells'
import copyHandler from './copyHandler'

const copyCutCtrl = ContentState => {
  ContentState.prototype.docCutHandler = docCutHandler
  ContentState.prototype.cutHandler = cutHandler
  ContentState.prototype.getClipBoardData = getClipBoardData
  ContentState.prototype.docCopyHandler = docCopyHandler
  ContentState.prototype.copyHandler = copyHandler
}

export default copyCutCtrl
