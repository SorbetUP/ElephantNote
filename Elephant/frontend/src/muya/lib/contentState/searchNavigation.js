export function setCursorToHighlight() {
  const { matches, index } = this.searchMatches
  const match = matches[index]
  if (!match) return
  const { key, start, end } = match
  this.cursor = {
    noHistory: true,
    start: { key, offset: start },
    end: { key, offset: end },
    istEdit: false
  }
}

export function find(action) {
  let { matches, index } = this.searchMatches
  const len = matches.length
  if (!len) return
  index = action === 'next' ? index + 1 : index - 1
  if (index < 0) index = len - 1
  if (index >= len) index = 0
  this.searchMatches.index = index
  this.setCursorToHighlight()
}
