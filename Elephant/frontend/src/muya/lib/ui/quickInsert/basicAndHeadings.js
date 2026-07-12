import { quickInsertIcons as icons } from './icons'
import { COMMAND_KEY, OPTION_KEY } from './shortcuts'

export const createBasicBlocks = (translate) => [{
  title: translate('quickInsert.paragraph.title'),
  subTitle: translate('quickInsert.paragraph.subtitle'),
  label: 'paragraph',
  shortCut: `${COMMAND_KEY}+0`,
  icon: icons.paragraph
}, {
  title: translate('quickInsert.horizontalLine.title'),
  subTitle: translate('quickInsert.horizontalLine.subtitle'),
  label: 'hr',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+-`,
  icon: icons.hr
}, {
  title: translate('quickInsert.frontMatter.title'),
  subTitle: translate('quickInsert.frontMatter.subtitle'),
  label: 'front-matter',
  shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Y`,
  icon: icons.frontMatter
}]

export const createHeadingBlocks = (translate) => [{
  title: translate('quickInsert.header1.title'),
  subTitle: translate('quickInsert.header1.subtitle'),
  label: 'heading 1',
  shortCut: `${COMMAND_KEY}+1`,
  icon: icons.header1
}, {
  title: translate('quickInsert.header2.title'),
  subTitle: translate('quickInsert.header2.subtitle'),
  label: 'heading 2',
  shortCut: `${COMMAND_KEY}+2`,
  icon: icons.header2
}, {
  title: translate('quickInsert.header3.title'),
  subTitle: translate('quickInsert.header3.subtitle'),
  label: 'heading 3',
  shortCut: `${COMMAND_KEY}+3`,
  icon: icons.header3
}, {
  title: translate('quickInsert.header4.title'),
  subTitle: translate('quickInsert.header4.subtitle'),
  label: 'heading 4',
  shortCut: `${COMMAND_KEY}+4`,
  icon: icons.header4
}, {
  title: translate('quickInsert.header5.title'),
  subTitle: translate('quickInsert.header5.subtitle'),
  label: 'heading 5',
  shortCut: `${COMMAND_KEY}+5`,
  icon: icons.header5
}, {
  title: translate('quickInsert.header6.title'),
  subTitle: translate('quickInsert.header6.subtitle'),
  label: 'heading 6',
  shortCut: `${COMMAND_KEY}+6`,
  icon: icons.header6
}]
