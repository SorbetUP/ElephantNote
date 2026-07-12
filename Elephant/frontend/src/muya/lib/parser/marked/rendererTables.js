export const tableRendererMethods = {
  table(header, body) {
    if (body) body = `<tbody>${body}</tbody>`
    return `<table>\n<thead>\n${header}</thead>\n${body}</table>\n`
  },

  tablerow(content) {
    return `<tr>\n${content}</tr>\n`
  },

  tablecell(content, flags) {
    const type = flags.header ? 'th' : 'td'
    const tag = flags.align ? `<${type} align="${flags.align}">` : `<${type}>`
    return `${tag}${content}</${type}>\n`
  }
}
