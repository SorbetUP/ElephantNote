import { edit, noop } from './utils'
import { block } from './blockBaseRules'
import { normal } from './blockGfmRules'

/* eslint-disable no-useless-escape */

export const pedantic = Object.assign({}, normal, {
  html: edit(
    '^ *(?:comment *(?:\\n|\\s*$)' +
    '|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)' +
    '|<tag(?:"[^"]*"|\'[^\']*\'|\\s[^\'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))')
    .replace('comment', block._comment)
    .replace(/tag/g, '(?!(?:' +
      'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub' +
      '|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)' +
      '\\b)\\w+(?!:|[^\\w\\s@]*@)\\b')
    .getRegex(),
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
  heading: /^(#{1,6})(.*)(?:\n+|$)/,
  fences: noop,
  paragraph: edit(normal._paragraph)
    .replace('hr', block.hr)
    .replace('heading', ' *#{1,6} *[^\n]')
    .replace('lheading', block.lheading)
    .replace('blockquote', ' {0,3}>')
    .replace('|fences', '')
    .replace('|list', '')
    .replace('|html', '')
    .getRegex()
})

/* eslint-enable no-useless-escape */
