import backspaceCase from './backspaceCase'
import backspaceDocument from './backspaceDocument'
import backspaceHandler from './backspaceHandler'

const backspaceCtrl = ContentState => {
  backspaceCase(ContentState)
  backspaceDocument(ContentState)
  backspaceHandler(ContentState)
}

export default backspaceCtrl
