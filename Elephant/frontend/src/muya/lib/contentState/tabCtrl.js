import tabCells from './tabCells'
import tabLists from './tabLists'
import tabInsertion from './tabInsertion'
import tabFormatEnd from './tabFormatEnd'
import tabHandler from './tabHandler'

const tabCtrl = ContentState => {
  tabCells(ContentState)
  tabLists(ContentState)
  tabInsertion(ContentState)
  tabFormatEnd(ContentState)
  tabHandler(ContentState)
}

export default tabCtrl
