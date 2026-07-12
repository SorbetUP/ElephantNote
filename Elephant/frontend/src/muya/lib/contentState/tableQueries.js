import { isLengthEven } from '../utils'

const TABLE_BLOCK_REG = /^\|.*?(\\*)\|.*?(\\*)\|/

const tableQueries = ContentState => {
  ContentState.prototype.getTableBlock = function() {
    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    const startParents = this.getParents(startBlock)
    const endParents = this.getParents(endBlock)
    const affiliation = startParents.filter(parent => endParents.includes(parent))
    if (affiliation.length) return affiliation.find(parent => parent.type === 'figure')
  }

  ContentState.prototype.tableBlockUpdate = function(block) {
    if (block.type !== 'p') return false
    const { text } = block.children[0]
    const match = TABLE_BLOCK_REG.exec(text)
    return match && isLengthEven(match[1]) && isLengthEven(match[2])
      ? this.initTable(block)
      : false
  }
}

export default tableQueries
