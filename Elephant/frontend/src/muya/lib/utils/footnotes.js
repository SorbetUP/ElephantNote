export const collectFootnotes = (blocks) => {
  const footnotes = new Map()
  for (const block of blocks) {
    if (block.type === 'figure' && block.functionType === 'footnote') {
      const identifier = block.children[0].text
      footnotes.set(identifier, block)
    }
  }
  return footnotes
}
