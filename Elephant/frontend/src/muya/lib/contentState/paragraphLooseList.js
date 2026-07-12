export function handleLooseListItem() {
  const { affiliation } = this.selectionChange(this.cursor)
  let listContainer = []
  if (affiliation.length >= 1 && /ul|ol/.test(affiliation[0].type)) {
    listContainer = affiliation[0].children
  } else if (affiliation.length >= 3 && affiliation[1].type === 'li') {
    listContainer = affiliation[2].children
  }
  if (listContainer.length > 0) {
    for (const block of listContainer) {
      block.isLooseListItem = !block.isLooseListItem
    }
    this.partialRender()
  }
}
