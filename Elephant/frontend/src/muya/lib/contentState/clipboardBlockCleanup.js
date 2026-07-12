import { escapeHTML } from '../utils'

export const normalizeClipboardCodeFences = (contentState, wrapper) => {
  for (const codeFence of wrapper.querySelectorAll("pre[data-role$='code']")) {
    const block = contentState.getBlock(codeFence.id)
    const language = block.lang || ''
    const codeContent = codeFence.querySelector('.ag-code-content')
    const value = escapeHTML(codeContent.textContent)
    codeFence.innerHTML = `<code class="language-${language}">${value}</code>`
  }
}

export const normalizeClipboardTightLists = wrapper => {
  for (const listItem of wrapper.querySelectorAll('.ag-tight-list-item')) {
    for (const item of listItem.childNodes) {
      if (
        item.tagName === 'P' &&
        item.childElementCount === 1 &&
        item.classList.contains('ag-paragraph')
      ) {
        listItem.replaceChild(item.firstElementChild, item)
      }
    }
  }
}

export const normalizeClipboardHtmlBlocks = wrapper => {
  for (const htmlBlock of wrapper.querySelectorAll("figure[data-role='HTML']")) {
    const codeContent = htmlBlock.querySelector('.ag-code-content')
    const pre = document.createElement('pre')
    pre.textContent = codeContent.textContent
    htmlBlock.replaceWith(pre)
  }
}

export const normalizeClipboardLineBreaks = wrapper => {
  const lineBreaks = wrapper.querySelectorAll(
    'span.ag-soft-line-break, span.ag-hard-line-break'
  )
  for (const lineBreak of lineBreaks) lineBreak.innerHTML = ''
}

export const normalizeClipboardContainers = wrapper => {
  for (const container of wrapper.querySelectorAll('figure.ag-container-block')) {
    const preElement = container.querySelector('pre[data-role]')
    const functionType = preElement.getAttribute('data-role')
    const codeContent = container.querySelector('.ag-code-content')
    const value = codeContent.textContent
    let pre
    switch (functionType) {
      case 'multiplemath':
        pre = document.createElement('pre')
        pre.classList.add('multiple-math')
        pre.textContent = value
        container.replaceWith(pre)
        break
      case 'mermaid':
      case 'flowchart':
      case 'sequence':
      case 'plantuml':
      case 'vega-lite':
        pre = document.createElement('pre')
        pre.innerHTML = `<code class="language-${functionType}">${value}</code>`
        container.replaceWith(pre)
        break
    }
  }
}
