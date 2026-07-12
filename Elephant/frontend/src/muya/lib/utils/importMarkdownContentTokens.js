const append = (state, block) => {
  state.contentState.appendChild(state.parentList[0], block)
}

const importTable = (state, token) => {
  const contentState = state.contentState
  const { header, align, cells } = token
  const table = contentState.createBlock('table')
  const thead = contentState.createBlock('thead')
  const tbody = contentState.createBlock('tbody')
  const theadRow = contentState.createBlock('tr')
  const restoreTableEscapeCharacters = text => text.replace(/\|/g, '\\|')

  for (let index = 0; index < header.length; index++) {
    const th = contentState.createBlock('th', {
      align: align[index] || '',
      column: index
    })
    const cellContent = contentState.createBlock('span', {
      text: restoreTableEscapeCharacters(header[index]),
      functionType: 'cellContent'
    })
    contentState.appendChild(th, cellContent)
    contentState.appendChild(theadRow, th)
  }

  for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
    const rowBlock = contentState.createBlock('tr')
    const rowContents = cells[rowIndex]
    for (let columnIndex = 0; columnIndex < rowContents.length; columnIndex++) {
      const td = contentState.createBlock('td', {
        align: align[columnIndex] || '',
        column: columnIndex
      })
      const cellContent = contentState.createBlock('span', {
        text: restoreTableEscapeCharacters(rowContents[columnIndex]),
        functionType: 'cellContent'
      })
      contentState.appendChild(td, cellContent)
      contentState.appendChild(rowBlock, td)
    }
    contentState.appendChild(tbody, rowBlock)
  }

  Object.assign(table, {
    row: cells.length,
    column: header.length - 1
  })
  const figure = contentState.createBlock('figure')
  figure.functionType = 'table'
  contentState.appendChild(thead, theadRow)
  contentState.appendChild(figure, table)
  contentState.appendChild(table, thead)
  if (tbody.children.length) contentState.appendChild(table, tbody)
  append(state, figure)
}

const importHtml = (state, token) => {
  const contentState = state.contentState
  const text = token.text.trim()
  if (/^<img[^<>]+>$/.test(text)) {
    const block = contentState.createBlock('p')
    const contentBlock = contentState.createBlock('span', { text })
    contentState.appendChild(block, contentBlock)
    append(state, block)
  } else {
    append(state, contentState.createHtmlBlock(text))
  }
}

const importText = (state, token) => {
  const contentState = state.contentState
  let value = token.text
  while (state.tokens[0] && state.tokens[0].type === 'text') {
    value += `\n${state.tokens.shift().text}`
  }
  const block = contentState.createBlock('p')
  const contentBlock = contentState.createBlock('span', { text: value })
  contentState.appendChild(block, contentBlock)
  append(state, block)
}

const importParagraph = (state, token) => {
  const contentState = state.contentState
  const block = contentState.createBlock('p')
  const contentBlock = contentState.createBlock('span', { text: token.text })
  contentState.appendChild(block, contentBlock)
  append(state, block)
}

export default function importMarkdownContentToken(state, token) {
  switch (token.type) {
    case 'table':
      importTable(state, token)
      return true
    case 'html':
      importHtml(state, token)
      return true
    case 'text':
      importText(state, token)
      return true
    case 'toc':
    case 'paragraph':
      importParagraph(state, token)
      return true
    default:
      return false
  }
}
