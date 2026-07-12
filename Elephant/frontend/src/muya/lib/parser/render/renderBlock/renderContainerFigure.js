import { CLASS_OR_ID } from '../../../config'
import { renderTableTools } from './renderToolBar'
import { footnoteJumpIcon } from './renderFootnoteJump'
import { renderEditIcon } from './renderContainerEditIcon'

const PREVIEW_FUNCTIONS = /html|multiplemath|flowchart|mermaid|sequence|plantuml|vega-lite/

export const renderContainerFigure = (block, activeBlocks, selector, data, children, t) => {
  const { functionType } = block
  if (functionType) {
    Object.assign(data.dataset, { role: functionType.toUpperCase() })
    if (functionType === 'table' && activeBlocks[0] && activeBlocks[0].functionType === 'cellContent') {
      children.unshift(renderTableTools(activeBlocks, t))
    } else if (functionType !== 'footnote') {
      children.unshift(renderEditIcon(t))
    } else children.push(footnoteJumpIcon())
  }
  if (PREVIEW_FUNCTIONS.test(functionType)) {
    selector += `.${CLASS_OR_ID.AG_CONTAINER_BLOCK}`
    Object.assign(data.attrs, { spellcheck: 'false' })
  }
  return selector
}
