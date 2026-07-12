import { quickInsertIcons as icons } from './icons'
import { COMMAND_KEY, OPTION_KEY, SHIFT_KEY } from './shortcuts'

export const createAdvancedBlocks = (translate) => [{
  title: translate('quickInsert.tableBlock.title'),
  subTitle: translate('quickInsert.tableBlock.subtitle'),
  label: 'table',
  shortCut: `${SHIFT_KEY}+${COMMAND_KEY}+T`,
  icon: icons.table
}, {
  title: translate('quickInsert.mathFormula.title'),
  subTitle: translate('quickInsert.mathFormula.subtitle'),
  label: 'mathblock',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+M`,
  icon: icons.mathblock
}, {
  title: translate('quickInsert.htmlBlock.title'),
  subTitle: translate('quickInsert.htmlBlock.subtitle'),
  label: 'html',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+J`,
  icon: icons.html
}, {
  title: translate('quickInsert.codeBlock.title'),
  subTitle: translate('quickInsert.codeBlock.subtitle'),
  label: 'pre',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+C`,
  icon: icons.code
}, {
  title: translate('quickInsert.quoteBlock.title'),
  subTitle: translate('quickInsert.quoteBlock.subtitle'),
  label: 'blockquote',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Q`,
  icon: icons.quote
}]

export const createListBlocks = (translate) => [{
  title: translate('quickInsert.orderedList.title'),
  subTitle: translate('quickInsert.orderedList.subtitle'),
  label: 'ol-order',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+O`,
  icon: icons.orderList
}, {
  title: translate('quickInsert.bulletList.title'),
  subTitle: translate('quickInsert.bulletList.subtitle'),
  label: 'ul-bullet',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+U`,
  icon: icons.bulletList
}, {
  title: translate('quickInsert.todoList.title'),
  subTitle: translate('quickInsert.todoList.subtitle'),
  label: 'ul-task',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+X`,
  icon: icons.todoList
}]
