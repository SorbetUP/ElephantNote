import { CLASS_OR_ID } from '../../../config'

const PRE_BLOCK_HASH = {
  fencecode: `.${CLASS_OR_ID.AG_FENCE_CODE}`,
  indentcode: `.${CLASS_OR_ID.AG_INDENT_CODE}`,
  html: `.${CLASS_OR_ID.AG_HTML_BLOCK}`,
  frontmatter: `.${CLASS_OR_ID.AG_FRONT_MATTER}`,
  multiplemath: `.${CLASS_OR_ID.AG_MULTIPLE_MATH}`,
  flowchart: `.${CLASS_OR_ID.AG_FLOWCHART}`,
  sequence: `.${CLASS_OR_ID.AG_SEQUENCE}`,
  plantuml: `.${CLASS_OR_ID.AG_PLANTUML}`,
  mermaid: `.${CLASS_OR_ID.AG_MERMAID}`,
  'vega-lite': `.${CLASS_OR_ID.AG_VEGA_LITE}`
}

export const renderContainerPre = (renderer, block, selector, data) => {
  const { functionType } = block
  Object.assign(data.attrs, { spellcheck: 'false' })
  Object.assign(data.dataset, { role: functionType })
  selector += PRE_BLOCK_HASH[functionType]

  if (/html|multiplemath|mermaid|flowchart|vega-lite|sequence|plantuml/.test(functionType)) {
    const codeBlock = block.children[0]
    const code = codeBlock.children.map(line => line.text).join('\n')
    renderer.codeCache.set(block.key, code)
  }
  return selector
}
