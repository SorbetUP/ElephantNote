import tableDragEvents from './tableDragEvents'
import tableDragStyles from './tableDragStyles'
import tableDragData from './tableDragData'

export { getAllTableCells, getIndex } from './tableDragGeometry'

const tableDragBarCtrl = ContentState => {
  tableDragEvents(ContentState)
  tableDragStyles(ContentState)
  tableDragData(ContentState)
}

export default tableDragBarCtrl
