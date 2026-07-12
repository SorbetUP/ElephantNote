export const mergeTextFragment = (contentState, firstFragment, tailFragments, startBlock, parent) => {
  const text = firstFragment.children[0].text
  const lines = text.split('\n')
  let target = parent
  if (parent.headingStyle === 'atx') {
    startBlock.text += lines[0]
    if (lines.length > 1) {
      target = contentState.createBlockP(lines.slice(1).join('\n'))
      contentState.insertAfter(target, parent)
    }
  } else {
    startBlock.text += text
  }
  tailFragments.forEach(block => {
    contentState.insertAfter(block, target)
    target = block
  })
}
