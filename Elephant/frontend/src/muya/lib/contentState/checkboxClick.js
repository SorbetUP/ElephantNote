import { CLASS_OR_ID } from '../config'
import { getParentCheckBox } from '../utils/getParentCheckBox'
import { cumputeCheckboxStatus } from '../utils/cumputeCheckBoxStatus'

export function setCheckBoxState(checkbox, checked) {
  checkbox.checked = checked
  const block = this.getBlock(checkbox.id)
  block.checked = checked
  checkbox.classList.toggle(CLASS_OR_ID.AG_CHECKBOX_CHECKED)
}

export function updateParentsCheckBoxState(checkbox) {
  let parent = getParentCheckBox(checkbox)
  while (parent !== null) {
    const checked = cumputeCheckboxStatus(parent)
    if (parent.checked !== checked) {
      this.setCheckBoxState(parent, checked)
      parent = getParentCheckBox(parent)
    } else {
      break
    }
  }
}

export function updateChildrenCheckBoxState(checkbox, checked) {
  const checkboxes = checkbox.parentElement.querySelectorAll(
    `input ~ ul .${CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX}`
  )
  const len = checkboxes.length
  for (let i = 0; i < len; i++) {
    const childCheckbox = checkboxes[i]
    if (childCheckbox.checked !== checked) {
      this.setCheckBoxState(childCheckbox, checked)
    }
  }
}

export function listItemCheckBoxClick(checkbox) {
  const { checked } = checkbox
  this.setCheckBoxState(checkbox, checked)

  const { autoCheck } = this.muya.options
  if (autoCheck) {
    this.updateChildrenCheckBoxState(checkbox, checked)
    this.updateParentsCheckBoxState(checkbox)
  }

  const block = this.getBlock(checkbox.id)
  const parentBlock = this.getParent(block)
  const firstEditableBlock = this.firstInDescendant(parentBlock)
  const { key } = firstEditableBlock
  const offset = 0
  this.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return this.partialRender()
}
