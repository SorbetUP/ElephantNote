import {
  listItemCheckBoxClick,
  setCheckBoxState,
  updateChildrenCheckBoxState,
  updateParentsCheckBoxState
} from './checkboxClick'
import { clickHandler } from './clickHandler'

const clickCtrl = (ContentState) => {
  ContentState.prototype.clickHandler = clickHandler
  ContentState.prototype.setCheckBoxState = setCheckBoxState
  ContentState.prototype.updateParentsCheckBoxState = updateParentsCheckBoxState
  ContentState.prototype.updateChildrenCheckBoxState = updateChildrenCheckBoxState
  ContentState.prototype.listItemCheckBoxClick = listItemCheckBoxClick
}

export default clickCtrl
