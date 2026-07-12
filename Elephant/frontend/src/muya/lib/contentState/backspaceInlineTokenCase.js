import { tokenizer, generator } from '../parser/'
import { handled } from './backspaceResults'

export const handleInlineTokenBackspace = (contentState, event, start, end, startBlock) => {
  const tokens = tokenizer(startBlock.text, { options: contentState.muya.options })
  let needRender = false
  let preToken = null
  for (const token of tokens) {
    if (token.range.end === start.offset && token.type === 'inline_math') {
      needRender = true
      token.raw = token.raw.substr(0, token.raw.length - 1)
      break
    }
    if (token.range.start + 1 === start.offset &&
        preToken && preToken.type === 'html_tag' && preToken.tag === 'ruby') {
      needRender = true
      token.raw = token.raw.substr(1)
      break
    }
    preToken = token
  }
  if (!needRender) return null

  startBlock.text = generator(tokens)
  event.preventDefault()
  start.offset--
  end.offset--
  contentState.cursor = { start, end, isEdit: true }
  return handled(contentState.partialRender())
}
