const renderHeading = (parser) => parser.renderer.heading(
  parser.inline.output(parser.token.text),
  parser.token.depth,
  unescape(parser.inlineText.output(parser.token.text)),
  parser.slugger,
  parser.token.headingStyle
)

const renderTable = (parser) => {
  let headerCells = ''
  for (let index = 0; index < parser.token.header.length; index += 1) {
    headerCells += parser.renderer.tablecell(
      parser.inline.output(parser.token.header[index]), {
        header: true,
        align: parser.token.align[index]
      }
    )
  }
  const header = parser.renderer.tablerow(headerCells)

  let body = ''
  for (const row of parser.token.cells) {
    let cells = ''
    for (let index = 0; index < row.length; index += 1) {
      cells += parser.renderer.tablecell(
        parser.inline.output(row[index]), {
          header: false,
          align: parser.token.align[index]
        }
      )
    }
    body += parser.renderer.tablerow(cells)
  }
  return parser.renderer.table(header, body)
}

const renderBlockquote = (parser) => {
  let body = ''
  while (parser.next().type !== 'blockquote_end') body += parser.tok()
  return parser.renderer.blockquote(body)
}

const renderFootnotes = (parser) => {
  let body = ''
  let itemBody = ''
  parser.footnoteIdentifier = parser.token.identifier

  while (parser.next()) {
    if (parser.token.type === 'footnote_end') {
      const footnoteInfo = parser.footnotes[parser.footnoteIdentifier]
      body += parser.renderer.footnoteItem(itemBody, footnoteInfo)
      parser.footnoteIdentifier = ''
      itemBody = ''
    } else if (parser.token.type === 'footnote_start') {
      parser.footnoteIdentifier = parser.token.identifier
      itemBody = ''
    } else {
      itemBody += parser.tok()
    }
  }
  return parser.renderer.footnote(body)
}

const renderList = (parser) => {
  let body = ''
  let taskList = false
  const { ordered, start } = parser.token

  while (parser.next().type !== 'list_end') {
    if (parser.token.checked !== undefined) taskList = true
    body += parser.tok()
  }
  return parser.renderer.list(body, ordered, start, taskList)
}

const renderListItem = (parser, loose) => {
  let body = ''
  const { checked } = parser.token
  while (parser.next().type !== 'list_item_end') {
    body += !loose && parser.token.type === 'text'
      ? parser.parseText()
      : parser.tok()
  }
  return parser.renderer.listitem(body, checked)
}

const renderUnknown = (parser) => {
  const message = `Token with "${parser.token.type}" type was not found.`
  if (parser.options.silent) {
    console.error(message)
    return undefined
  }
  throw new Error(message)
}

export const renderCurrentToken = (parser) => {
  switch (parser.token.type) {
    case 'frontmatter':
      return parser.renderer.frontmatter(parser.token.text)
    case 'space':
      return ''
    case 'hr':
      return parser.renderer.hr()
    case 'heading':
      return renderHeading(parser)
    case 'multiplemath':
      return parser.renderer.multiplemath(parser.token.text)
    case 'code': {
      const { codeBlockStyle, text, lang, escaped } = parser.token
      return parser.renderer.code(text, lang, escaped, codeBlockStyle)
    }
    case 'table':
      return renderTable(parser)
    case 'blockquote_start':
      return renderBlockquote(parser)
    case 'footnote_start':
      return renderFootnotes(parser)
    case 'list_start':
      return renderList(parser)
    case 'list_item_start':
      return renderListItem(parser, false)
    case 'loose_item_start':
      return renderListItem(parser, true)
    case 'html':
      return parser.renderer.html(parser.token.text)
    case 'paragraph':
      return parser.renderer.paragraph(parser.inline.output(parser.token.text))
    case 'text':
      return parser.renderer.paragraph(parser.parseText())
    case 'toc':
      return parser.renderer.toc()
    default:
      return renderUnknown(parser)
  }
}
