const BRACKET_HASH = {
  '{': '}',
  '[': ']',
  '(': ')',
  '*': '*',
  _: '_',
  '"': '"',
  "'": "'",
  $: '$',
  '~': '~'
}

const BACK_HASH = {
  '}': '{',
  ']': '[',
  ')': '(',
  '*': '*',
  _: '_',
  '"': '"',
  "'": "'",
  $: '$',
  '~': '~'
}

export default function applyInputAutoPair(contentState, event, block, text, start, end) {
  let needRender = false
  if (!(start.key === end.key && start.offset === end.offset && event.type === 'input')) {
    return { text, needRender }
  }

  const { offset } = start
  const { autoPairBracket, autoPairMarkdownSyntax, autoPairQuote } = contentState.muya.options
  const inputChar = text.charAt(+offset - 1)
  const preInputChar = text.charAt(+offset - 2)
  const prePreInputChar = text.charAt(+offset - 3)
  const postInputChar = text.charAt(+offset)

  if (/^delete/.test(event.inputType)) {
    const deletedChar = block.text[offset]
    if (
      event.inputType === 'deleteContentBackward' &&
      postInputChar === BRACKET_HASH[deletedChar]
    ) {
      needRender = true
      text = text.substring(0, offset) + text.substring(offset + 1)
    }
    if (event.inputType === 'deleteContentForward' && inputChar === BACK_HASH[deletedChar]) {
      needRender = true
      start.offset -= 1
      end.offset -= 1
      text = text.substring(0, offset - 1) + text.substring(offset)
    }
  } else if (
    event.inputType.indexOf('delete') === -1 &&
    inputChar === postInputChar &&
    ((autoPairQuote && /[']{1}/.test(inputChar)) ||
      (autoPairQuote && /["]{1}/.test(inputChar)) ||
      (autoPairBracket && /[\}\]\)]{1}/.test(inputChar)) ||
      (autoPairMarkdownSyntax && /[$]{1}/.test(inputChar)) ||
      (autoPairMarkdownSyntax &&
        /[*$`~_]{1}/.test(inputChar) &&
        /[_*~]{1}/.test(prePreInputChar)))
  ) {
    needRender = true
    text = text.substring(0, offset) + text.substring(offset + 1)
  } else {
    const isInInlineMath = contentState.checkCursorInTokenType(
      block.functionType,
      text,
      offset,
      'inline_math'
    )
    const isInInlineCode = contentState.checkCursorInTokenType(
      block.functionType,
      text,
      offset,
      'inline_code'
    )
    if (
      !/\\/.test(preInputChar) &&
      ((autoPairQuote &&
        /[']{1}/.test(inputChar) &&
        !/[\S]{1}/.test(postInputChar) &&
        !/[a-zA-Z\d]{1}/.test(preInputChar)) ||
        (autoPairQuote && /["]{1}/.test(inputChar) && !/[\S]{1}/.test(postInputChar)) ||
        (autoPairBracket && /[\{\[\(]{1}/.test(inputChar) && !/[\S]{1}/.test(postInputChar)) ||
        (block.functionType !== 'codeContent' &&
          !isInInlineMath &&
          !isInInlineCode &&
          autoPairMarkdownSyntax &&
          !/[a-z0-9]{1}/i.test(preInputChar) &&
          /[*$`~_]{1}/.test(inputChar)))
    ) {
      needRender = true
      text = BRACKET_HASH[event.data]
        ? text.substring(0, offset) + BRACKET_HASH[inputChar] + text.substring(offset)
        : text
    }
    if (
      /\s/.test(event.data) &&
      /^\* /.test(text) &&
      preInputChar === '*' &&
      postInputChar === '*'
    ) {
      text = text.substring(0, offset) + text.substring(offset + 1)
      needRender = true
    }
  }

  return { text, needRender }
}
