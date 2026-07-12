export function copyCodeBlock(event) {
  const preEle = event.target.closest('pre')
  const preBlock = this.getBlock(preEle.id)
  const codeBlock = preBlock.children.find(child => child.type === 'code')
  this.muya.clipboard.copy('copyCodeContent', codeBlock.children[0].text)
}

export function resizeLineNumber() {
  // FIXME: Disabled due to #1648.
}
