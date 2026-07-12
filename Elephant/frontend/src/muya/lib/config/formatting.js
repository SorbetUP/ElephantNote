export const LINE_BREAK = '\n'

export const DEFAULT_TURNDOWN_CONFIG = Object.freeze({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  blankReplacement(content, node) {
    if (node && node.classList.contains('ag-soft-line-break')) {
      return LINE_BREAK
    } else if (node && node.classList.contains('ag-hard-line-break')) {
      return '  ' + LINE_BREAK
    } else if (node && node.classList.contains('ag-hard-line-break-sapce')) {
      return ''
    } else {
      return node.isBlock ? '\n\n' : ''
    }
  }
})

export const FORMAT_MARKER_MAP = Object.freeze({
  em: '*',
  inline_code: '`',
  strong: '**',
  del: '~~',
  inline_math: '$',
  u: { open: '<u>', close: '</u>' },
  sub: { open: '<sub>', close: '</sub>' },
  sup: { open: '<sup>', close: '</sup>' },
  mark: { open: '<mark>', close: '</mark>' }
})

export const FORMAT_TYPES = Object.freeze([
  'strong',
  'em',
  'del',
  'inline_code',
  'link',
  'image',
  'inline_math'
])
