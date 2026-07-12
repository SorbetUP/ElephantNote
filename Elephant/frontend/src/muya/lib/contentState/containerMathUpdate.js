export function updateMathBlock(block) {
  const functionType = 'multiplemath'
  const { type } = block
  if (type === 'span' && block.functionType === 'paragraphContent') {
    const isMathBlock = !!block.text.match(/^`{3,}math\s*/)
    if (isMathBlock) {
      const result = this.initContainerBlock(functionType, block, 'gitlab')
      if (result) {
        const { key } = result
        const offset = 0
        this.cursor = {
          start: { key, offset },
          end: { key, offset },
          isEdit: false
        }
        this.partialRender()
        return result
      }
    }
    return false
  } else if (type !== 'p') {
    return false
  }

  const { text } = block.children[0]
  return text.trim() === '$$'
    ? this.initContainerBlock(functionType, block, '')
    : false
}
