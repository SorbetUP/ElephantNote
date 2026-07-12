import { isLengthEven } from '../utils'

export default function consumeTokenizerBegin(state, beginRules) {
  if (!beginRules || state.pos !== 0) return
  const beginRuleList = ['header', 'hr', 'code_fense', 'multiple_math']
  for (const ruleName of beginRuleList) {
    const match = beginRules[ruleName].exec(state.src)
    if (match) {
      state.tokens.push({
        type: ruleName,
        raw: match[0],
        parent: state.tokens,
        marker: match[1],
        content: match[2] || '',
        backlash: match[3] || '',
        range: {
          start: state.pos,
          end: state.pos + match[0].length
        }
      })
      state.src = state.src.substring(match[0].length)
      state.pos += match[0].length
      break
    }
  }

  const definition = beginRules.reference_definition.exec(state.src)
  if (definition && isLengthEven(definition[3])) {
    state.tokens.push({
      type: 'reference_definition',
      parent: state.tokens,
      leftBracket: definition[1],
      label: definition[2],
      backlash: definition[3] || '',
      rightBracket: definition[4],
      leftHrefMarker: definition[5] || '',
      href: definition[6],
      rightHrefMarker: definition[7] || '',
      leftTitlespace: definition[8],
      titleMarker: definition[9] || '',
      title: definition[10] || '',
      rightTitleSpace: definition[11] || '',
      raw: definition[0],
      range: {
        start: state.pos,
        end: state.pos + definition[0].length
      }
    })
    state.src = state.src.substring(definition[0].length)
    state.pos += definition[0].length
  }
}
