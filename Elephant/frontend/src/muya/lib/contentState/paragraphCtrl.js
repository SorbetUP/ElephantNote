import paragraphSelection from './paragraphSelection'
import paragraphFrontMatter from './paragraphFrontMatter'
import paragraphLists from './paragraphLists'
import paragraphCodeBlock from './paragraphCodeBlock'
import paragraphQuote from './paragraphQuote'
import paragraphContainers from './paragraphContainers'
import paragraphUpdate from './paragraphUpdate'
import paragraphOperations from './paragraphOperations'
import paragraphSelectAll from './paragraphSelectAll'
import paragraphTypes from './paragraphTypes'

const paragraphCtrl = ContentState => {
  paragraphSelection(ContentState)
  paragraphFrontMatter(ContentState)
  paragraphLists(ContentState)
  paragraphCodeBlock(ContentState)
  paragraphQuote(ContentState)
  paragraphContainers(ContentState)
  paragraphUpdate(ContentState)
  paragraphOperations(ContentState)
  paragraphSelectAll(ContentState)
  paragraphTypes(ContentState)
}

export default paragraphCtrl
