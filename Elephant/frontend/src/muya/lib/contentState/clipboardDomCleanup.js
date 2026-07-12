import { CLASS_OR_ID } from '../config'

export const removeClipboardChrome = wrapper => {
  const removedElements = wrapper.querySelectorAll(
    `.${CLASS_OR_ID.AG_TOOL_BAR},
    .${CLASS_OR_ID.AG_MATH_RENDER},
    .${CLASS_OR_ID.AG_RUBY_RENDER},
    .${CLASS_OR_ID.AG_HTML_PREVIEW},
    .${CLASS_OR_ID.AG_MATH_PREVIEW},
    .${CLASS_OR_ID.AG_COPY_REMOVE},
    .${CLASS_OR_ID.AG_LANGUAGE_INPUT},
    .${CLASS_OR_ID.AG_HTML_TAG} br,
    .${CLASS_OR_ID.AG_FRONT_ICON}`
  )
  for (const element of removedElements) element.remove()
}

export const restoreTaskCheckboxes = wrapper => {
  const taskListItems = wrapper.querySelectorAll('li.ag-task-list-item')
  for (const item of taskListItems) {
    const firstChild = item.firstElementChild
    if (firstChild && firstChild.nodeName !== 'INPUT') {
      const originItem = document.querySelector(`#${item.id}`)
      let checked = false
      if (
        originItem &&
        originItem.firstElementChild &&
        originItem.firstElementChild.nodeName === 'INPUT'
      ) {
        checked = originItem.firstElementChild.checked
      }
      const input = document.createElement('input')
      input.setAttribute('type', 'checkbox')
      if (checked) input.setAttribute('checked', true)
      item.insertBefore(input, firstChild)
    }
  }
}

export const normalizeClipboardImages = wrapper => {
  const imageWrappers = wrapper.querySelectorAll('span.ag-inline-image')
  for (const imageWrapper of imageWrappers) {
    const dataRaw = imageWrapper.getAttribute('data-raw')
    const image = imageWrapper.querySelector('img')
    if (!image) continue
    const markdownSrcMatch = dataRaw.match(/!\[\]\((.*)\)/)
    let finalSrc = ''
    if (markdownSrcMatch && markdownSrcMatch.length >= 2) {
      finalSrc = markdownSrcMatch[1]
    } else {
      const imgSrcMatch = dataRaw.match(/<img[^>]*\bsrc="([^"]*)"/)
      finalSrc = imgSrcMatch && imgSrcMatch.length >= 2
        ? imgSrcMatch[1]
        : image.getAttribute('src')
    }
    image.setAttribute(
      'src',
      finalSrc.replace('file://', '').replace(/\?msec=\d+/, '')
    )
  }
}

export const normalizeClipboardBlocks = wrapper => {
  for (const hr of wrapper.querySelectorAll('[data-role=hr]')) {
    hr.replaceWith(document.createElement('hr'))
  }
  for (const header of wrapper.querySelectorAll('[data-head]')) {
    const paragraph = document.createElement('p')
    paragraph.textContent = header.textContent
    header.replaceWith(paragraph)
  }
}

export const normalizeClipboardInlines = wrapper => {
  const inlineRuleElements = wrapper.querySelectorAll(
    `a.${CLASS_OR_ID.AG_INLINE_RULE},
    code.${CLASS_OR_ID.AG_INLINE_RULE},
    strong.${CLASS_OR_ID.AG_INLINE_RULE},
    em.${CLASS_OR_ID.AG_INLINE_RULE},
    del.${CLASS_OR_ID.AG_INLINE_RULE}`
  )
  for (const element of inlineRuleElements) {
    const span = document.createElement('span')
    span.textContent = element.textContent
    element.replaceWith(span)
  }
  for (const link of wrapper.querySelectorAll(`.${CLASS_OR_ID.AG_A_LINK}`)) {
    const span = document.createElement('span')
    span.innerHTML = link.innerHTML
    link.replaceWith(span)
  }
}
