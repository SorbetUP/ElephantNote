import htmlTags, { voidHtmlTags } from 'html-tags'

export const HAS_TEXT_BLOCK_REG = /^span$/i
export const VOID_HTML_TAGS = Object.freeze(voidHtmlTags)
export const HTML_TAGS = Object.freeze(htmlTags)

// TYPE1 ~ TYPE7 according to https://github.github.com/gfm/#html-blocks
export const BLOCK_TYPE1 = Object.freeze(['script', 'pre', 'style'])
export const BLOCK_TYPE2_REG = /^<!--(?=\s).*\s+-->$/
export const BLOCK_TYPE6 = Object.freeze([
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'meta',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'section',
  'source',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul'
])

export const BLOCK_TYPE7 = Object.freeze(
  htmlTags.filter((tag) => {
    return !BLOCK_TYPE1.find((type) => type === tag) &&
      !BLOCK_TYPE6.find((type) => type === tag)
  })
)

export const PARAGRAPH_TYPES = Object.freeze([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'figure'
])

export const blockContainerElementNames = Object.freeze([
  ...PARAGRAPH_TYPES,
  'address',
  'article',
  'aside',
  'audio',
  'canvas',
  'dd',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'footer',
  'form',
  'header',
  'hgroup',
  'main',
  'nav',
  'noscript',
  'output',
  'section',
  'video',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td'
])

export const emptyElementNames = Object.freeze([
  'br',
  'col',
  'colgroup',
  'hr',
  'img',
  'input',
  'source',
  'wbr'
])
