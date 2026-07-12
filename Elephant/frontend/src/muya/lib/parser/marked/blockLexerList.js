import {
  listTypeChanged,
  nextItemLeavesList,
  outdentListItem,
  parseTaskMarker,
  pushListStart,
  stripListBullet,
  updateLooseListItems
} from './blockLexerListHelpers'

export default function consumeList(lexer, state) {
  let match = lexer.rules.list.exec(state.src)
  if (!match) return false

  state.src = state.src.substring(match[0].length)
  let bull = match[2]
  let isOrdered = bull.length > 1
  if (
    state.prevListIsOrdered !== null &&
    state.prevListIsOrdered !== isOrdered
  ) {
    match = match[0].match(lexer.rules.item)
    lexer.tokens.push({
      type: 'paragraph',
      text: state.cursorAnchorFocus + match[0].trimEnd()
    })
    if (match.length > 1) {
      lexer.token(
        match.slice(1).join('\n'),
        false,
        state.prevListIsOrdered,
        state.checkCursorSignature
      )
    }
    return true
  }

  isOrdered = pushListStart(lexer, bull, match[0])
  let next = false
  let prevNext = true
  let listItemIndices = []
  let isTaskList = false
  const items = match[0].match(lexer.rules.item)

  for (let index = 0; index < items.length; index++) {
    const itemWithBullet = items[index]
    let {
      item,
      newBull,
      space
    } = stripListBullet(itemWithBullet, bull)
    const newIsOrdered = bull.length > 1 && /\d{1,9}/.test(newBull)
    let checked
    let newIsTaskListItem
    ;({
      item,
      space,
      checked,
      isTask: newIsTaskListItem
    } = parseTaskMarker(lexer, item, space, newIsOrdered))

    if (index === 0) item = state.cursorAnchorFocus + item
    if (index === 0) {
      isTaskList = newIsTaskListItem
    } else if (
      listTypeChanged(
        index,
        bull,
        newBull,
        isOrdered,
        newIsOrdered,
        isTaskList,
        newIsTaskListItem
      )
    ) {
      lexer.tokens.push({ type: 'list_end' })
      bull = newBull
      isOrdered = newIsOrdered
      isTaskList = newIsTaskListItem
      pushListStart(lexer, bull, itemWithBullet, isOrdered)
    }

    item = outdentListItem(lexer, item, space)
    if (nextItemLeavesList(lexer, items, index, bull)) {
      state.src = items.slice(index + 1).join('\n') + state.src
      index = items.length - 1
    }

    const previousItem = index === 0 ? item : items[index - 1]
    let loose
    loose = next = next || /\n\n(?!\s*$)/.test(item)
    if (
      !loose &&
      (index !== 0 || items.length > 1) &&
      previousItem.length !== 0 &&
      previousItem.charAt(previousItem.length - 1) === '\n'
    ) {
      loose = next = true
    }

    listItemIndices = updateLooseListItems(
      lexer,
      next,
      prevNext,
      listItemIndices
    )
    prevNext = next
    if (!loose) listItemIndices.push(lexer.tokens.length)

    const isOrderedListItem = /\d/.test(bull)
    lexer.tokens.push({
      checked,
      listItemType: bull.length > 1 ? 'order' : isTaskList ? 'task' : 'bullet',
      bulletMarkerOrDelimiter: isOrderedListItem
        ? bull.slice(-1)
        : bull.charAt(0),
      type: loose ? 'loose_item_start' : 'list_item_start'
    })

    if (/^\s*$/.test(item)) {
      lexer.tokens.push({ type: 'text', text: state.cursorAnchorFocus })
    } else {
      lexer.token(item, false, isOrdered, state.checkCursorSignature)
    }
    lexer.tokens.push({ type: 'list_item_end' })
  }

  lexer.tokens.push({ type: 'list_end' })
  return true
}
