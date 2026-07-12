import tableCellSelectionState from './tableCellSelectionState'
import tableCellSelectionMutations from './tableCellSelectionMutations'

const tableSelectCellsCtrl = ContentState => {
  tableCellSelectionState(ContentState)
  tableCellSelectionMutations(ContentState)
}

export default tableSelectCellsCtrl
