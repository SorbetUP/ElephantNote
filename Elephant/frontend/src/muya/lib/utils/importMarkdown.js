import importMarkdownState from './importMarkdownState'
import importHtml from './importHtml'
import importCursorIndex from './importCursorIndex'
import importCursorSignature from './importCursorSignature'
import importImages from './importImages'

const importRegister = ContentState => {
  importMarkdownState(ContentState)
  importHtml(ContentState)
  importCursorIndex(ContentState)
  importCursorSignature(ContentState)
  importImages(ContentState)
}

export default importRegister
