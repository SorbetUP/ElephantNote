import { splitCells } from './utils'

const normalizeAlignment = alignments => {
  for (let index = 0; index < alignments.length; index++) {
    if (/^ *-+: *$/.test(alignments[index])) {
      alignments[index] = 'right'
    } else if (/^ *:-+: *$/.test(alignments[index])) {
      alignments[index] = 'center'
    } else if (/^ *:-+ *$/.test(alignments[index])) {
      alignments[index] = 'left'
    } else {
      alignments[index] = null
    }
  }
}

const createTable = (match, leadingPipe) => {
  const table = {
    type: 'table',
    header: splitCells(match[1].replace(/^ *| *\| *$/g, '')),
    align: match[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
    cells: match[3] ? match[3].replace(/\n$/, '').split('\n') : []
  }
  if (table.header.length !== table.align.length) return null
  normalizeAlignment(table.align)
  for (let index = 0; index < table.cells.length; index++) {
    const row = leadingPipe
      ? table.cells[index].replace(/^ *\| *| *\| *$/g, '')
      : table.cells[index]
    table.cells[index] = splitCells(row, table.header.length)
  }
  return table
}

export const consumeNoPipeTable = (lexer, state) => {
  const match = lexer.rules.nptable.exec(state.src)
  if (!match) return false
  const table = createTable(match, false)
  if (!table) return false
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push(table)
  return true
}

export const consumePipeTable = (lexer, state) => {
  const match = lexer.rules.table.exec(state.src)
  if (!match) return false
  const table = createTable(match, true)
  if (!table) return false
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push(table)
  return true
}
