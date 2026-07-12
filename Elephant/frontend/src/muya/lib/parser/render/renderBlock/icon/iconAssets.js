import paragraphIcon from '../../../../assets/pngicon/paragraph/2.png'
import htmlIcon from '../../../../assets/pngicon/html/2.png'
import hrIcon from '../../../../assets/pngicon/horizontal_line/2.png'
import frontMatterIcon from '../../../../assets/pngicon/front_matter/2.png'
import header1Icon from '../../../../assets/pngicon/heading_1/2.png'
import header2Icon from '../../../../assets/pngicon/heading_2/2.png'
import header3Icon from '../../../../assets/pngicon/heading_3/2.png'
import header4Icon from '../../../../assets/pngicon/heading_4/2.png'
import header5Icon from '../../../../assets/pngicon/heading_5/2.png'
import header6Icon from '../../../../assets/pngicon/heading_6/2.png'
import newTableIcon from '../../../../assets/pngicon/new_table/2.png'
import bulletListIcon from '../../../../assets/pngicon/bullet_list/2.png'
import codeIcon from '../../../../assets/pngicon/code/2.png'
import quoteIcon from '../../../../assets/pngicon/quote_block/2.png'
import todoListIcon from '../../../../assets/pngicon/todolist/2.png'
import mathblockIcon from '../../../../assets/pngicon/math/2.png'
import orderListIcon from '../../../../assets/pngicon/order_list/2.png'
import flowchartIcon from '../../../../assets/pngicon/flowchart/2.png'
import sequenceIcon from '../../../../assets/pngicon/sequence/2.png'
import plantumlIcon from '../../../../assets/pngicon/plantuml/2.png'
import mermaidIcon from '../../../../assets/pngicon/mermaid/2.png'
import vegaIcon from '../../../../assets/pngicon/chart/2.png'
import footnoteIcon from '../../../../assets/pngicon/footnote/2.png'
import formatLink from '../../../../assets/pngicon/format_link/2.png'

export const FUNCTION_TYPE_ICON = Object.freeze({
  mermaid: mermaidIcon,
  flowchart: flowchartIcon,
  sequence: sequenceIcon,
  plantuml: plantumlIcon,
  'vega-lite': vegaIcon,
  table: newTableIcon,
  html: htmlIcon,
  multiplemath: mathblockIcon,
  fencecode: codeIcon,
  indentcode: codeIcon,
  frontmatter: frontMatterIcon,
  footnote: footnoteIcon
})

export const TYPE_ICON = Object.freeze({
  p: paragraphIcon,
  ol: orderListIcon,
  blockquote: quoteIcon,
  h1: header1Icon,
  h2: header2Icon,
  h3: header3Icon,
  h4: header4Icon,
  h5: header5Icon,
  h6: header6Icon,
  hr: hrIcon
})

export {
  paragraphIcon,
  bulletListIcon,
  todoListIcon,
  formatLink
}
