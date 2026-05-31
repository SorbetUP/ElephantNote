import paragraphIcon from '../../assets/pngicon/paragraph/2.png'
import htmlIcon from '../../assets/pngicon/html/2.png'
import hrIcon from '../../assets/pngicon/horizontal_line/2.png'
import frontMatterIcon from '../../assets/pngicon/front_matter/2.png'
import header1Icon from '../../assets/pngicon/heading_1/2.png'
import header2Icon from '../../assets/pngicon/heading_2/2.png'
import header3Icon from '../../assets/pngicon/heading_3/2.png'
import header4Icon from '../../assets/pngicon/heading_4/2.png'
import header5Icon from '../../assets/pngicon/heading_5/2.png'
import header6Icon from '../../assets/pngicon/heading_6/2.png'
import newTableIcon from '../../assets/pngicon/new_table/2.png'
import bulletListIcon from '../../assets/pngicon/bullet_list/2.png'
import codeIcon from '../../assets/pngicon/code/2.png'
import quoteIcon from '../../assets/pngicon/quote_block/2.png'
import todoListIcon from '../../assets/pngicon/todolist/2.png'
import mathblockIcon from '../../assets/pngicon/math/2.png'
import orderListIcon from '../../assets/pngicon/order_list/2.png'
import flowchartIcon from '../../assets/pngicon/flowchart/2.png'
import sequenceIcon from '../../assets/pngicon/sequence/2.png'
import plantumlIcon from '../../assets/pngicon/plantuml/2.png'
import mermaidIcon from '../../assets/pngicon/mermaid/2.png'
import vegaIcon from '../../assets/pngicon/chart/2.png'
import { isOsx } from '../../config'

const COMMAND_KEY = isOsx ? '⌘' : 'Ctrl'
const OPTION_KEY = isOsx ? '⌥' : 'Alt'
const SHIFT_KEY = isOsx ? '⇧' : 'Shift'
const excalidrawIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTgiIGZpbGw9IiM2QzYzRkYiLz48cGF0aCBkPSJNMjAgNDRjNy41LTE1LjUgMTUuNS0yMy41IDI0LTI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTE4IDQ2bDgtMi02LTYtMiA4eiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik00MiAxOGw0IDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjIyIiByPSI0IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuODUiLz48cGF0aCBkPSJNNDIgNDJoNyIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iLjg1Ii8+PC9zdmc+'

// Creates a function to generate the config object, accepting a translation function as a parameter
export const createQuickInsertObj = (t) => {
  const translate = t || ((key) => key)

  return {
    'Writing tools': [{
      title: 'Heading 2',
      subTitle: '## Heading',
      label: 'elephant-command heading-2',
      shortCut: '',
      icon: header2Icon
    }, {
      title: 'Bold',
      subTitle: '**bold**',
      label: 'elephant-command bold',
      shortCut: '',
      icon: paragraphIcon
    }, {
      title: 'Italic',
      subTitle: '*italic*',
      label: 'elephant-command italic',
      shortCut: '',
      icon: paragraphIcon
    }, {
      title: 'Strikethrough',
      subTitle: '~~text~~',
      label: 'elephant-command strike',
      shortCut: '',
      icon: paragraphIcon
    }, {
      title: 'Link',
      subTitle: '[text](url)',
      label: 'elephant-command link',
      shortCut: '',
      icon: paragraphIcon
    }, {
      title: 'Bullet List',
      subTitle: '- item',
      label: 'elephant-command bullets',
      shortCut: '',
      icon: bulletListIcon
    }, {
      title: 'Numbered List',
      subTitle: '1. item',
      label: 'elephant-command numbers',
      shortCut: '',
      icon: orderListIcon
    }, {
      title: 'Task List',
      subTitle: '- [ ] task',
      label: 'elephant-command tasks',
      shortCut: '',
      icon: todoListIcon
    }, {
      title: 'Inline Code',
      subTitle: '`code`',
      label: 'elephant-command code',
      shortCut: '',
      icon: codeIcon
    }, {
      title: 'Quote',
      subTitle: '> quote',
      label: 'elephant-command quote',
      shortCut: '',
      icon: quoteIcon
    }, {
      title: 'Table',
      subTitle: '| column |',
      label: 'elephant-command table',
      shortCut: '',
      icon: newTableIcon
    }, {
      title: 'Image',
      subTitle: 'Insert image',
      label: 'elephant-command image',
      shortCut: '',
      icon: paragraphIcon
    }, {
      title: 'Excalidraw',
      subTitle: 'Insert drawing',
      label: 'elephant-command excalidraw',
      shortCut: '',
      icon: excalidrawIcon
    }, {
      title: 'Horizontal Rule',
      subTitle: '---',
      label: 'elephant-command horizontal-rule',
      shortCut: '',
      icon: hrIcon
    }],
    [translate('quickInsert.basicBlock')]: [{
      title: translate('quickInsert.paragraph.title'),
      subTitle: translate('quickInsert.paragraph.subtitle'),
      label: 'paragraph',
      shortCut: `${COMMAND_KEY}+0`,
      icon: paragraphIcon
    }, {
      title: translate('quickInsert.horizontalLine.title'),
      subTitle: translate('quickInsert.horizontalLine.subtitle'),
      label: 'hr',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+-`,
      icon: hrIcon
    }, {
      title: translate('quickInsert.frontMatter.title'),
      subTitle: translate('quickInsert.frontMatter.subtitle'),
      label: 'front-matter',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Y`,
      icon: frontMatterIcon
    }],
    [translate('quickInsert.header')]: [{
      title: translate('quickInsert.header1.title'),
      subTitle: translate('quickInsert.header1.subtitle'),
      label: 'heading 1',
      shortCut: `${COMMAND_KEY}+1`,
      icon: header1Icon
    }, {
      title: translate('quickInsert.header2.title'),
      subTitle: translate('quickInsert.header2.subtitle'),
      label: 'heading 2',
      shortCut: `${COMMAND_KEY}+2`,
      icon: header2Icon
    }, {
      title: translate('quickInsert.header3.title'),
      subTitle: translate('quickInsert.header3.subtitle'),
      label: 'heading 3',
      shortCut: `${COMMAND_KEY}+3`,
      icon: header3Icon
    }, {
      title: translate('quickInsert.header4.title'),
      subTitle: translate('quickInsert.header4.subtitle'),
      label: 'heading 4',
      shortCut: `${COMMAND_KEY}+4`,
      icon: header4Icon
    }, {
      title: translate('quickInsert.header5.title'),
      subTitle: translate('quickInsert.header5.subtitle'),
      label: 'heading 5',
      shortCut: `${COMMAND_KEY}+5`,
      icon: header5Icon
    }, {
      title: translate('quickInsert.header6.title'),
      subTitle: translate('quickInsert.header6.subtitle'),
      label: 'heading 6',
      shortCut: `${COMMAND_KEY}+6`,
      icon: header6Icon
    }],
    [translate('quickInsert.advancedBlock')]: [{
      title: translate('quickInsert.tableBlock.title'),
      subTitle: translate('quickInsert.tableBlock.subtitle'),
      label: 'table',
      shortCut: `${SHIFT_KEY}+${COMMAND_KEY}+T`,
      icon: newTableIcon
    }, {
      title: translate('quickInsert.mathFormula.title'),
      subTitle: translate('quickInsert.mathFormula.subtitle'),
      label: 'mathblock',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+M`,
      icon: mathblockIcon
    }, {
      title: translate('quickInsert.htmlBlock.title'),
      subTitle: translate('quickInsert.htmlBlock.subtitle'),
      label: 'html',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+J`,
      icon: htmlIcon
    }, {
      title: translate('quickInsert.codeBlock.title'),
      subTitle: translate('quickInsert.codeBlock.subtitle'),
      label: 'pre',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+C`,
      icon: codeIcon
    }, {
      title: translate('quickInsert.quoteBlock.title'),
      subTitle: translate('quickInsert.quoteBlock.subtitle'),
      label: 'blockquote',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Q`,
      icon: quoteIcon
    }],
    [translate('quickInsert.listBlock')]: [{
      title: translate('quickInsert.orderedList.title'),
      subTitle: translate('quickInsert.orderedList.subtitle'),
      label: 'ol-order',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+O`,
      icon: orderListIcon
    }, {
      title: translate('quickInsert.bulletList.title'),
      subTitle: translate('quickInsert.bulletList.subtitle'),
      label: 'ul-bullet',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+U`,
      icon: bulletListIcon
    }, {
      title: translate('quickInsert.todoList.title'),
      subTitle: translate('quickInsert.todoList.subtitle'),
      label: 'ul-task',
      shortCut: `${OPTION_KEY}+${COMMAND_KEY}+X`,
      icon: todoListIcon
    }],
    [translate('quickInsert.diagram')]: [{
      title: translate('quickInsert.vegaChart.title'),
      subTitle: translate('quickInsert.vegaChart.subtitle'),
      label: 'vega-lite',
      icon: vegaIcon
    }, {
      title: translate('quickInsert.flowChart.title'),
      subTitle: translate('quickInsert.flowChart.subtitle'),
      label: 'flowchart',
      icon: flowchartIcon
    }, {
      title: translate('quickInsert.sequenceChart.title'),
      subTitle: translate('quickInsert.sequenceChart.subtitle'),
      label: 'sequence',
      icon: sequenceIcon
    }, {
      title: translate('quickInsert.plantUMLChart.title'),
      subTitle: translate('quickInsert.plantUMLChart.subtitle'),
      label: 'plantuml',
      icon: plantumlIcon
    }, {
      title: translate('quickInsert.mermaid.title'),
      subTitle: translate('quickInsert.mermaid.subtitle'),
      label: 'mermaid',
      icon: mermaidIcon
    }]
  }
}

// Maintained for backward compatibility; export the default configuration
// Old exports removed — all call sites should use the createQuickInsertObj function
