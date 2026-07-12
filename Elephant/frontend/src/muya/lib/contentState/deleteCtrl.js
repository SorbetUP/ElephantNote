import { deleteHandler } from './deleteForward'
import { docDeleteHandler } from './docDeleteSelection'

const deleteCtrl = ContentState => {
  ContentState.prototype.docDeleteHandler = docDeleteHandler
  ContentState.prototype.deleteHandler = deleteHandler
}

export default deleteCtrl
