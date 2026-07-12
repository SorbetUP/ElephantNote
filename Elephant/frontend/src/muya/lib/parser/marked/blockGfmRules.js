import { edit } from './utils'
import { block } from './blockBaseRules'

/* eslint-disable no-useless-escape */

export const normal = Object.assign({}, block)

export const gfm = Object.assign({}, normal, {
  nptable: '^ *([^|\\n ].*\\|.*)\\n' +
    ' {0,3}([-:]+ *\\|[-| :]*)' +
    '(?:\\n((?:(?!\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)',
  table: '^ *\\|(.+)\\n' +
    ' {0,3}\\|?( *[-:]+[-| :]*)' +
    '(?:\\n *((?:(?!\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)'
})

gfm.nptable = edit(gfm.nptable)
  .replace('hr', block.hr)
  .replace('heading', ' {0,3}#{1,6} ')
  .replace('blockquote', ' {0,3}>')
  .replace('code', ' {4}[^\\n]')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
  .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
  .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|!--)')
  .replace('tag', block._tag)
  .getRegex()

gfm.table = edit(gfm.table)
  .replace('hr', block.hr)
  .replace('heading', ' {0,3}#{1,6} ')
  .replace('blockquote', ' {0,3}>')
  .replace('code', ' {4}[^\\n]')
  .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
  .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
  .replace('html', '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|!--)')
  .replace('tag', block._tag)
  .getRegex()

/* eslint-enable no-useless-escape */
