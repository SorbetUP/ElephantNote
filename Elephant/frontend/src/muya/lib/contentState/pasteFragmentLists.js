const normalizeListLooseness = (originList, fragment) => {
  const targetLoose = fragment.children[0].isLooseListItem
  const originLoose = originList.children[0].isLooseListItem
  if (targetLoose === originLoose) return
  const list = targetLoose ? originList : fragment
  list.children.forEach(item => (item.isLooseListItem = true))
}

export const mergeListFragment = (contentState, firstFragment, tailFragments, startBlock, parent) => {
  const listItems = firstFragment.children
  const firstListItem = listItems[0]
  const originListItem = contentState.getParent(parent)
  const originList = contentState.getParent(originListItem)
  normalizeListLooseness(originList, firstFragment)

  if (firstListItem.children[0].type === 'p') {
    startBlock.text += firstListItem.children[0].children[0].text
    firstListItem.children.slice(1).forEach(child => contentState.appendChild(originListItem, child))
    listItems.slice(1).forEach(item => contentState.appendChild(originList, item))
  } else {
    listItems.forEach(item => contentState.appendChild(originList, item))
  }

  let target = originList
  tailFragments.forEach(block => {
    contentState.insertAfter(block, target)
    target = block
  })
}
