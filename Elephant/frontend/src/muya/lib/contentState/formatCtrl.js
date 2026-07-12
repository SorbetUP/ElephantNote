import formatSelectionState from './formatSelectionState'
import formatActions from './formatActions'

const formatCtrl = ContentState => {
  formatSelectionState(ContentState)
  formatActions(ContentState)
}

export default formatCtrl
