import enterBlockChop from './enterBlockChop'
import enterFactories from './enterFactories'
import enterEmptyParagraph from './enterEmptyParagraph'
import enterDocument from './enterDocument'
import enterHandler from './enterHandler'

const enterCtrl = ContentState => {
  enterBlockChop(ContentState)
  enterFactories(ContentState)
  enterEmptyParagraph(ContentState)
  enterDocument(ContentState)
  enterHandler(ContentState)
}

export default enterCtrl
