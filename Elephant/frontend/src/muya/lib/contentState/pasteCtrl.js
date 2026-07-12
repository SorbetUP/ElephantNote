import pasteChecks from './pasteChecks'
import pasteHtml from './pasteHtml'
import pasteImage from './pasteImage'
import pasteHandler from './pasteHandler'

const pasteCtrl = ContentState => {
  pasteChecks(ContentState)
  pasteHtml(ContentState)
  pasteImage(ContentState)
  pasteHandler(ContentState)
}

export default pasteCtrl
