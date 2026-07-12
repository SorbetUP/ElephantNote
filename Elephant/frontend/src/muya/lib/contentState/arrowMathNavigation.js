import { EVENT_KEYS, CLASS_OR_ID } from '../config'
import selection from '../selection'

export const handleMathArrowRight = (event, node, start, end) => {
  if (event.key !== EVENT_KEYS.ArrowRight || !node?.classList?.contains(CLASS_OR_ID.AG_MATH_TEXT)) {
    return { handled: false }
  }
  const { right } = selection.getCaretOffsets(node)
  if (right === 0 && start.key === end.key && start.offset === end.offset) {
    return { handled: true, value: selection.select(node.parentNode.nextElementSibling, 0) }
  }
  return { handled: false }
}
