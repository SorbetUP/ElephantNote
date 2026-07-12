import { edit, noop } from './utils'

/* eslint-disable no-useless-escape */

export const block = {
  newline: /^\n+/,
  code: /^( {4}[^\n]+\n*)+/,
  fences: /^ {0,3}(`{3,}(?=[^`\n]*\n)|~{3,})([^\n]*)\n(?:|([\s\S]*?)\n)(?: {0,3}\1[~`]* *(?:\n+|$)|$)/,
  hr: /^ {0,3}((?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})(?:\n+|$)/,
  heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
  blockquote:
    /^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/, 
  list: /^( {0,3})(bull) [\s\S]+?(?:hr|def|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
  html: '^ {0,3}(?:' +
    '<(script|pre|style)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)' +
    '|comment[^\\n]*(\\n+|$)' +
    '|<\\?[\\s\\S]*?(?:\\?>\\n*|$)' +
    '|<![A-Z][\\s\\S]*?(?:>\\n*|$)' +
    '|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)' +
    '|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:\\n{2,}|$)' +
    '|<(?!script|pre|style)([a-z][\\w-]*)(?:attribute)*? */?>(?=\\h*\\n)[\\s\\S]*?(?:\\n{2,}|$)' +
    '|</(?!script|pre|style)[a-z][\\w-]*\\s*>(?=\\h*\\n)[\\s\\S]*?(?:\\n{2,}|$)' +
    ')',
  def: /^ {0,3}\[(label)\]: *\n? *<?([^\s>]+)>?(?:(?: +\n? *| *\n *)(title))? *(?:\n+|$)/,
  nptable: noop,
  table: noop,
  lheading: /^([^\n]+)\n {0,3}(=+|-+) *(?:\n+|$)/,
  _paragraph: /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html)[^\n]+)*)/,
  text: /^[^\n]+/,
  frontmatter: /^(?:(?:---\n([\s\S]+?)---)|(?:\+\+\+\n([\s\S]+?)\+\+\+)|(?:;;;\n([\s\S]+?);;;)|(?:\{\n([\s\S]+?)\}))(?:\n{2,}|\n{1,2}$)/,
  multiplemath: /^\$\$\n([\s\S]+?)\n\$\$(?:\n+|$)/,
  multiplemathGitlab: /^ {0,3}(`{3,})math\n(?:(|[\s\S]*?)\n)(?: {0,3}\1`* *(?:\n+|$)|$)/,
  footnote: /^\[\^([^\^\[\]\s]+?)(?<!\\)\]:[\s\S]+?(?=\n *\n {0,3}[^ ]+|$)/
}

block._label = /(?!\s*\])(?:\\[\[\]]|[^\[\]])+/
block._title = /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/
block.def = edit(block.def)
  .replace('label', block._label)
  .replace('title', block._title)
  .getRegex()
block.checkbox = /^\[([ xX])\] +/
block.bullet = /(?:[*+-]|\d{1,9}(?:\.|\)))/
block.item = /^(( {0,3})(bull) [^\n]*(?:\n(?!(\2bull |\2bull\n))[^\n]*)*|( {0,3})(bull)(?:\n(?!(\2bull |\2bull\n)))*)/ // eslint-disable-line no-useless-backreference
block.item = edit(block.item, 'gm').replace(/bull/g, block.bullet).getRegex()
block.list = edit(block.list)
  .replace(/bull/g, block.bullet)
  .replace('hr', '\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))')
  .replace('def', '\\n+(?=' + block.def.source + ')')
  .getRegex()
block._tag = 'address|article|aside|base|basefont|blockquote|body|caption' +
  '|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption' +
  '|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe' +
  '|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option' +
  '|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr' +
  '|track|ul'
block._comment = /<!--(?!-?>)[\s\S]*?(?:-->|$)/
block.html = edit(block.html, 'i')
  .replace('comment', block._comment)
  .replace('tag', block._tag)
  .replace('attribute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
  .getRegex()
block.paragraph = edit(block._paragraph)
  .replace('hr', block.hr)
  .replace('heading', ' {0,3}#{1,6} ')
  .replace('|lheading', '')
  .replace('blockquote', ' {0,3}>')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
  .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
  .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|!--)')
  .replace('tag', block._tag)
  .getRegex()
block.blockquote = edit(block.blockquote)
  .replace('paragraph', block.paragraph)
  .getRegex()

/* eslint-enable no-useless-escape */
