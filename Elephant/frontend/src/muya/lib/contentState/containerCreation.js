export function createContainerBlock(functionType, value = '', style = undefined) {
  const figureBlock = this.createBlock('figure', { functionType })
  if (functionType === 'multiplemath') {
    if (style === undefined) {
      figureBlock.mathStyle = this.isGitlabCompatibilityEnabled ? 'gitlab' : ''
    }
    figureBlock.mathStyle = style
  }
  const { preBlock, preview } = this.createPreAndPreview(functionType, value)
  this.appendChild(figureBlock, preBlock)
  this.appendChild(figureBlock, preview)
  return figureBlock
}

export function initContainerBlock(functionType, block, style = undefined) {
  block.type = 'figure'
  block.functionType = functionType
  block.children = []
  if (functionType === 'multiplemath') {
    if (style === undefined) {
      block.mathStyle = this.isGitlabCompatibilityEnabled ? 'gitlab' : ''
    }
    block.mathStyle = style
  }
  const { preBlock, preview } = this.createPreAndPreview(functionType)
  this.appendChild(block, preBlock)
  this.appendChild(block, preview)
  return preBlock.children[0].children[0]
}
