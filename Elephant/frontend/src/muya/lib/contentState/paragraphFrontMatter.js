const paragraphFrontMatter = ContentState => {
  ContentState.prototype.handleFrontMatter = function() {
    const firstBlock = this.blocks[0]
    if (
      firstBlock.type === 'pre' &&
      firstBlock.functionType === 'frontmatter'
    ) {
      return
    }

    const { frontmatterType } = this.muya.options
    let lang
    let style
    switch (frontmatterType) {
      case '+':
        lang = 'toml'
        style = '+'
        break
      case ';':
        lang = 'json'
        style = ';'
        break
      case '{':
        lang = 'json'
        style = '{'
        break
      default:
        lang = 'yaml'
        style = '-'
        break
    }

    const frontMatter = this.createBlock('pre', {
      functionType: 'frontmatter',
      lang,
      style
    })
    const codeBlock = this.createBlock('code', { lang })
    const emptyCodeContent = this.createBlock('span', {
      functionType: 'codeContent',
      lang
    })

    this.appendChild(codeBlock, emptyCodeContent)
    this.appendChild(frontMatter, codeBlock)
    this.insertBefore(frontMatter, firstBlock)
    const { key } = emptyCodeContent
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
  }
}

export default paragraphFrontMatter
