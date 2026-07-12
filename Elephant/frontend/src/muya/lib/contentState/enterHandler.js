import selection from '../selection'
import handleEnterInitial from './enterInitialCases'
import handleEnterTable from './enterTable'
import splitEnterBlock from './enterSplitBlock'
import finishEnter from './enterPostUpdate'

const enterHandler = ContentState => {
  ContentState.prototype.enterHandler = function(event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) return event.preventDefault()

    let result = handleEnterInitial(this, event, start, end)
    if (result.handled) return result.value
    let { block, text, parent } = result.context

    result = handleEnterTable(this, event, result.context)
    if (result.handled) return result.value

    if (block.type === 'span') {
      block = parent
      parent = this.getParent(block)
    }
    const paragraph = document.querySelector(`#${block.key}`)
    if (parent && parent.type === 'li' && block.type === 'p') {
      block = parent
      parent = this.getParent(block)
    }

    result = splitEnterBlock(
      this,
      { block, text, parent, paragraph },
      start
    )
    if (result.handled) return result.value
    return finishEnter(this, result.context)
  }
}

export default enterHandler
