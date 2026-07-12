import { FORMAT_TYPES } from '../config'

export const isInlineFormatToken = token => {
  const { type, tag } = token
  if (FORMAT_TYPES.includes(type)) return true
  return type === 'html_tag' && /^(?:u|sub|sup|mark)$/i.test(tag)
}
