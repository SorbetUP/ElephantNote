import updateChecks from './updateChecks'
import updateThematic from './updateThematic'
import updateList from './updateList'
import updateTaskList from './updateTaskList'
import updateHeadings from './updateHeadings'
import updateBlocks from './updateBlocks'

const updateCtrl = ContentState => {
  updateChecks(ContentState)
  updateThematic(ContentState)
  updateList(ContentState)
  updateTaskList(ContentState)
  updateHeadings(ContentState)
  updateBlocks(ContentState)
}

export default updateCtrl
