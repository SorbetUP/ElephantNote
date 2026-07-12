export const pushListStart = (lexer, bull, source) => {
  const ordered = bull.length > 1
  lexer.tokens.push({
    type: 'list_start',
    ordered,
    listType: ordered
      ? 'order'
      : /^( {0,3})([-*+]) \[[xX ]\]/.test(source)
        ? 'task'
        : 'bullet',
    start: ordered ? +bull.slice(0, -1) : ''
  })
  return ordered
}

export const stripListBullet = (item, bull) => {
  let newBull
  let space = item.length
  const text = item.replace(/^ *([*+-]|\d+(?:\.|\))) {0,4}/, (match, marker) => {
    newBull = marker || bull
    return ''
  })
  return { item: text, newBull, space }
}

export const parseTaskMarker = (lexer, item, space, isOrdered) => {
  let checked
  let isTask = false
  if (!isOrdered && lexer.options.gfm) {
    const match = lexer.rules.checkbox.exec(item)
    if (match) {
      checked = match[1] === 'x' || match[1] === 'X'
      isTask = true
      item = item.replace(lexer.rules.checkbox, '')
      space -= 4
    }
  }
  return { item, space, checked, isTask }
}

export const listTypeChanged = (
  index,
  bull,
  newBull,
  isOrdered,
  newIsOrdered,
  isTaskList,
  newIsTaskListItem
) => {
  return (
    index !== 0 &&
    ((!isOrdered && !newIsOrdered && bull !== newBull) ||
      (isOrdered && newIsOrdered && bull.slice(-1) !== newBull.slice(-1)) ||
      isOrdered !== newIsOrdered ||
      isTaskList !== newIsTaskListItem)
  )
}

export const outdentListItem = (lexer, item, space) => {
  if (!~item.indexOf('\n ')) return item
  space -= item.length
  return !lexer.options.pedantic
    ? item.replace(new RegExp('^ {1,' + space + '}', 'gm'), '')
    : item.replace(/^ {1,4}/gm, '')
}

export const nextItemLeavesList = (lexer, cap, index, bull) => {
  if (index === cap.length - 1) return false
  const nextBull = lexer.rules.bullet.exec(cap[index + 1])[0]
  return bull.length > 1
    ? nextBull.length === 1
    : nextBull.length > 1 || (lexer.options.smartLists && nextBull !== bull)
}

export const updateLooseListItems = (
  lexer,
  next,
  prevNext,
  listItemIndices
) => {
  if (next && prevNext !== next) {
    for (const index of listItemIndices) {
      lexer.tokens[index].type = 'loose_item_start'
    }
    return []
  }
  return listItemIndices
}
