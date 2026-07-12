import { calculateSelectedCells } from './tableCellSelectionCalculation'
import {
  handleCellMouseDown,
  handleCellMouseMove,
  handleCellMouseUp
} from './tableCellSelectionEvents'
import { setSelectedCellsStyle } from './tableCellSelectionStyles'
import { selectTable } from './tableSelection'

const tableCellSelectionState = ContentState => {
  ContentState.prototype.handleCellMouseDown = handleCellMouseDown
  ContentState.prototype.handleCellMouseMove = handleCellMouseMove
  ContentState.prototype.handleCellMouseUp = handleCellMouseUp
  ContentState.prototype.calculateSelectedCells = calculateSelectedCells
  ContentState.prototype.setSelectedCellsStyle = setSelectedCellsStyle
  ContentState.prototype.selectTable = selectTable
}

export default tableCellSelectionState
