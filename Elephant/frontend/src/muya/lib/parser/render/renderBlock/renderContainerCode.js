import renderCopyButton from './renderCopyButton'
import {
  renderExecutableOutput,
  renderExecutableRunButton
} from './renderExecutableCodeRuntime'

export const renderContainerCode = (selector, data, children, block, t) => {
  const { type, lang, functionType } = block
  if (!/code|pre/.test(type)) return selector

  if (typeof lang === 'string' && lang) {
    selector += `.language-${lang.replace(/[#.]{1}/g, '')}`
  }
  if (type === 'pre') {
    children.unshift(renderCopyButton(t))
    if (functionType === 'fencecode') {
      children.unshift(renderExecutableRunButton(block))
      children.push(renderExecutableOutput(block))
    }
  }
  Object.assign(data.attrs, { spellcheck: 'false' })
  return selector
}
