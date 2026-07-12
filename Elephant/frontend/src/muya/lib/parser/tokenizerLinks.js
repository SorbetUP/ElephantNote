import { isLengthEven } from '../utils'
import { parseSrcAndTitle } from './utils'
import { correctUrl, pushPending } from './tokenizerShared'

export const consumeImage = state => {
  const match = state.rules.image.exec(state.src)
  correctUrl(match)
  if (!match || !isLengthEven(match[3]) || !isLengthEven(match[5])) return false
  const { src, title } = parseSrcAndTitle(match[4])
  pushPending(state)
  state.tokens.push({
    type: 'image',
    raw: match[0],
    marker: match[1],
    srcAndTitle: match[4],
    attrs: {
      src: src + encodeURI(match[5]),
      title,
      alt: match[2] + encodeURI(match[3])
    },
    src,
    title,
    parent: state.tokens,
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    alt: match[2],
    backlash: {
      first: match[3],
      second: match[5]
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

export const consumeLink = (state, recurse) => {
  const match = state.rules.link.exec(state.src)
  correctUrl(match)
  if (!match || !isLengthEven(match[3]) || !isLengthEven(match[5])) return false
  const { src: href, title } = parseSrcAndTitle(match[4])
  pushPending(state)
  state.tokens.push({
    type: 'link',
    raw: match[0],
    marker: match[1],
    hrefAndTitle: match[4],
    href,
    title,
    parent: state.tokens,
    anchor: match[2],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    children: recurse(
      match[2],
      undefined,
      state.rules,
      state.pos + match[1].length,
      false,
      state.labels,
      state.options
    ),
    backlash: {
      first: match[3],
      second: match[5]
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

export const consumeReferenceLink = (state, recurse) => {
  const match = state.rules.reference_link.exec(state.src)
  if (
    !match ||
    !state.labels.has(match[3] || match[1]) ||
    !isLengthEven(match[2]) ||
    !isLengthEven(match[4])
  ) {
    return false
  }
  pushPending(state)
  state.tokens.push({
    type: 'reference_link',
    raw: match[0],
    isFullLink: !!match[3],
    parent: state.tokens,
    anchor: match[1],
    backlash: {
      first: match[2],
      second: match[4] || ''
    },
    label: match[3] || match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    children: recurse(
      match[1],
      undefined,
      state.rules,
      state.pos + 1,
      false,
      state.labels,
      state.options
    )
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

export const consumeReferenceImage = state => {
  const match = state.rules.reference_image.exec(state.src)
  if (
    !match ||
    !state.labels.has(match[3] || match[1]) ||
    !isLengthEven(match[2]) ||
    !isLengthEven(match[4])
  ) {
    return false
  }
  pushPending(state)
  state.tokens.push({
    type: 'reference_image',
    raw: match[0],
    isFullLink: !!match[3],
    parent: state.tokens,
    alt: match[1],
    backlash: {
      first: match[2],
      second: match[4] || ''
    },
    label: match[3] || match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}
