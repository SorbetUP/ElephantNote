import { tokenizer } from '../parser'

const BOTH_SIDES_FORMATS = [
  'strong',
  'em',
  'inline_code',
  'image',
  'link',
  'reference_image',
  'reference_link',
  'emoji',
  'del',
  'html_tag',
  'inline_math'
]

const tabFormatEnd = ContentState => {
  ContentState.prototype.checkCursorAtEndFormat = function(text, offset) {
    const { labels } = this.stateRender
    const tokens = tokenizer(text, {
      hasBeginRules: false,
      labels,
      options: this.muya.options
    })
    let result = null
    const walkTokens = items => {
      for (const token of items) {
        const {
          marker,
          type,
          range,
          children,
          srcAndTitle,
          hrefAndTitle,
          backlash,
          closeTag,
          isFullLink,
          label
        } = token
        const { start, end } = range
        if (BOTH_SIDES_FORMATS.includes(type) && offset > start && offset < end) {
          switch (type) {
            case 'strong':
            case 'em':
            case 'inline_code':
            case 'emoji':
            case 'del':
            case 'inline_math':
              if (marker && offset === end - marker.length) {
                result = { offset: marker.length }
                return
              }
              break
            case 'image':
            case 'link': {
              const linkTitleLength = (srcAndTitle || hrefAndTitle).length
              const secondSlashLength = backlash && backlash.second ? backlash.second.length : 0
              if (offset === end - 3 - (linkTitleLength + secondSlashLength)) {
                result = { offset: 2 }
                return
              } else if (offset === end - 1) {
                result = { offset: 1 }
                return
              }
              break
            }
            case 'reference_image':
            case 'reference_link': {
              const labelLength = label ? label.length : 0
              const secondSlashLength = backlash && backlash.second ? backlash.second.length : 0
              if (isFullLink) {
                if (offset === end - 3 - labelLength - secondSlashLength) {
                  result = { offset: 2 }
                  return
                } else if (offset === end - 1) {
                  result = { offset: 1 }
                  return
                }
              } else if (offset === end - 1) {
                result = { offset: 1 }
                return
              }
              break
            }
            case 'html_tag':
              if (closeTag && offset === end - closeTag.length) {
                result = { offset: closeTag.length }
                return
              }
              break
          }
        }
        if (children && children.length) walkTokens(children)
      }
    }
    walkTokens(tokens)
    return result
  }
}

export default tabFormatEnd
