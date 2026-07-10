const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const escapeAttr = (value = '') => escapeHtml(value).replaceAll("'", '&#39;')

const plainText = (nodes = []) => nodes.map((node) => {
  if (Array.isArray(node?.children) && node.children.length) return plainText(node.children)
  return node?.text || ''
}).join('')

const findClosing = (source, marker, from) => {
  const index = source.indexOf(marker, from)
  return index >= from ? index : -1
}

// This parser is restricted to isolated JS tests and the explicitly enabled
// non-Tauri fallback. The active Tauri editor receives inlineNodes from Rust.
export const parseInlineFallback = (source = '') => {
  const value = String(source)
  const nodes = []
  let offset = 0
  const pushText = (text) => {
    if (!text) return
    const previous = nodes.at(-1)
    if (previous?.type === 'text') previous.text += text
    else nodes.push({ type: 'text', text })
  }

  while (offset < value.length) {
    const rest = value.slice(offset)
    const image = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/)
    if (image) {
      nodes.push({ type: 'image', text: image[0], alt: image[1], href: image[2], title: image[3] || '' })
      offset += image[0].length
      continue
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/)
    if (link) {
      nodes.push({
        type: 'link',
        text: link[1],
        href: link[2],
        title: link[3] || '',
        marker: '[]()',
        children: parseInlineFallback(link[1])
      })
      offset += link[0].length
      continue
    }

    const paired = [
      ['**', 'strong'],
      ['__', 'strong'],
      ['~~', 'strike'],
      ['`', 'code'],
      ['*', 'emphasis'],
      ['_', 'emphasis']
    ].find(([syntax]) => rest.startsWith(syntax) && findClosing(value, syntax, offset + syntax.length) >= 0)

    if (paired) {
      const [syntax, type] = paired
      const end = findClosing(value, syntax, offset + syntax.length)
      const inner = value.slice(offset + syntax.length, end)
      nodes.push({
        type,
        marker: syntax,
        text: inner,
        children: type === 'code' ? undefined : parseInlineFallback(inner)
      })
      offset = end + syntax.length
      continue
    }

    const next = rest.slice(1).search(/[![_*~`]/)
    const length = next < 0 ? rest.length : next + 1
    pushText(rest.slice(0, length))
    offset += length
  }
  return nodes
}

const localImageSource = (source = '') => {
  const value = String(source || '').trim()
  if (!value || /^(?:https?:|data:|blob:|file:|asset:)/i.test(value)) return value
  const base = globalThis.window?.DIRNAME
  const path = globalThis.window?.path
  if (!base || typeof path?.resolve !== 'function') return value
  const absolute = path.resolve(base, value)
  const convertFileSrc = globalThis.window?.__TAURI__?.core?.convertFileSrc
  if (typeof convertFileSrc === 'function') return convertFileSrc(absolute)
  return `file://${absolute}`
}

const marker = (text, className = 'ag-hide') => `<span class="${className}" data-muya-marker="true">${escapeHtml(text)}</span>`

export const inlineNodesToHtml = (nodes = []) => nodes.map((node) => {
  const type = node?.type || 'text'
  const children = Array.isArray(node?.children) && node.children.length
    ? inlineNodesToHtml(node.children)
    : escapeHtml(node?.text || '')

  if (type === 'strong') {
    const syntax = node.marker || '**'
    return `<span class="ag-strong-marked-text" data-muya-inline="strong">${marker(syntax)}<strong>${children}</strong>${marker(syntax)}</span>`
  }
  if (type === 'emphasis') {
    const syntax = node.marker || '*'
    return `<span class="ag-em-marked-text" data-muya-inline="emphasis">${marker(syntax)}<em>${children}</em>${marker(syntax)}</span>`
  }
  if (type === 'strike') {
    const syntax = node.marker || '~~'
    return `<span class="ag-del-marked-text" data-muya-inline="strike">${marker(syntax)}<del>${children}</del>${marker(syntax)}</span>`
  }
  if (type === 'code') {
    const syntax = node.marker || '`'
    return `<span class="ag-code-marked-text" data-muya-inline="code">${marker(syntax)}<code>${escapeHtml(node.text || '')}</code>${marker(syntax)}</span>`
  }
  if (type === 'link') {
    const label = Array.isArray(node.children) && node.children.length
      ? inlineNodesToHtml(node.children)
      : escapeHtml(node.text || '')
    const href = node.href || ''
    const title = node.title ? ` title="${escapeAttr(node.title)}"` : ''
    const destination = `${href}${node.title ? ` "${node.title}"` : ''}`
    return `<span class="ag-link ag-link-in-bracket" data-muya-inline="link" data-href="${escapeAttr(href)}">${marker('[')}<a href="${escapeAttr(href)}"${title}>${label}</a>${marker(`](${destination})`)}</span>`
  }
  if (type === 'image') {
    const alt = node.alt || ''
    const href = node.href || node.src || ''
    const title = node.title || ''
    const syntax = `![${alt}](${href}${title ? ` "${title}"` : ''})`
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
    return `<span class="ag-image-marked-text ag-image-success" data-muya-inline="image" data-source="${escapeAttr(href)}">${marker(syntax, 'ag-hide ag-image-src')}<span class="ag-image-container" contenteditable="false"><img class="ag-inline-image" alt="${escapeAttr(alt)}" src="${escapeAttr(localImageSource(href))}"${titleAttr}></span></span>`
  }
  if (type === 'hard_break') return '<br class="ag-hard-line-break">'
  return escapeHtml(node?.text || '')
}).join('')

const blockInlineHtml = (block) => {
  if (Array.isArray(block?.inlineNodes)) return inlineNodesToHtml(block.inlineNodes)

  const nodes = Array.isArray(block?.children) && block.children.length
    ? block.children
    : parseInlineFallback(block?.text || '')
  if (nodes.length === 1 && nodes[0]?.type === 'text' && nodes[0]?.text === (block?.text || '')) {
    return inlineNodesToHtml(parseInlineFallback(block.text || ''))
  }
  return inlineNodesToHtml(nodes)
}

const blockId = (block, index) => escapeAttr(block?.key || `muya-rust-${index}`)

const renderTable = (block, index) => {
  const headers = block.headers || []
  const alignments = block.alignments || []
  const rows = block.rows || []
  const header = headers.map((cell, column) => `<th class="ag-paragraph" data-column="${column}" style="text-align:${escapeAttr(alignments[column] || 'left')}"><span class="ag-cell-content">${inlineNodesToHtml(parseInlineFallback(cell))}</span></th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell, column) => `<td class="ag-paragraph" data-column="${column}" style="text-align:${escapeAttr(alignments[column] || 'left')}"><span class="ag-cell-content">${inlineNodesToHtml(parseInlineFallback(cell))}</span></td>`).join('')}</tr>`).join('')
  return `<figure id="${blockId(block, index)}" class="ag-paragraph" data-role="TABLE" data-muya-block="table"><table class="ag-paragraph"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></figure>`
}

const renderListItem = (block, index) => {
  const ordered = Boolean(block.ordered)
  const listTag = ordered ? 'ol' : 'ul'
  const listClass = ordered ? 'ag-order-list' : 'ag-bullet-list'
  const itemClass = ordered ? 'ag-order-list-item' : 'ag-bullet-list-item'
  const start = ordered ? ` start="${Number(block.index) || 1}"` : ''
  const checkbox = block.type === 'task_list_item'
    ? `<input class="ag-task-list-item-checkbox${block.checked ? ' ag-checkbox-checked' : ''}" type="checkbox"${block.checked ? ' checked' : ''} contenteditable="false">`
    : ''
  const taskClass = block.type === 'task_list_item' ? ' ag-task-list-item' : ''
  return `<${listTag} id="${blockId(block, index)}" class="ag-paragraph ${listClass}"${start} data-depth="${Number(block.depth) || 0}" data-muya-block="${escapeAttr(block.type)}"><li class="ag-paragraph ag-list-item ${itemClass}${taskClass}" data-marker="${ordered ? `${Number(block.index) || 1}.` : '-'}">${checkbox}<span class="ag-paragraph-content">${blockInlineHtml(block) || '<br>'}</span></li></${listTag}>`
}

const renderBlock = (block, index) => {
  const id = blockId(block, index)
  const type = block?.type || 'paragraph'
  if (type === 'heading') {
    const level = Math.max(1, Math.min(6, Number(block.level) || 1))
    return `<h${level} id="${id}" class="ag-paragraph atx" data-head="h${level}" data-role="h${level}" data-muya-block="heading">${blockInlineHtml(block) || '<br>'}</h${level}>`
  }
  if (type === 'blockquote') {
    return `<blockquote id="${id}" class="ag-paragraph" data-muya-block="blockquote"><p class="ag-paragraph"><span class="ag-paragraph-content">${blockInlineHtml(block) || '<br>'}</span></p></blockquote>`
  }
  if (type === 'code_fence') {
    const language = String(block.language || '').replace(/[^a-z0-9_+#.-]/gi, '')
    const languageClass = language ? ` language-${escapeAttr(language)}` : ''
    return `<pre id="${id}" class="ag-paragraph ag-fence-code${languageClass}" data-role="fencecode" data-muya-block="code_fence" spellcheck="false"><span class="ag-language" contenteditable="false" data-muya-ui="true">${escapeHtml(language)}</span><code class="ag-paragraph ag-code-content${languageClass}">${escapeHtml(block.text || '')}</code></pre>`
  }
  if (type === 'math_block') {
    return `<figure id="${id}" class="ag-paragraph ag-container-block" data-role="MULTIPLEMATH" data-muya-block="math_block"><pre class="ag-paragraph ag-multiple-math" spellcheck="false"><code class="ag-paragraph ag-code-content">${escapeHtml(block.text || '')}</code></pre><div class="ag-paragraph ag-container-preview math-block katex-display" contenteditable="false" data-muya-ui="true" data-latex="${escapeAttr(block.text || '')}">${escapeHtml(block.text || '')}</div></figure>`
  }
  if (type === 'table') return renderTable(block, index)
  if (type === 'list_item' || type === 'task_list_item') return renderListItem(block, index)
  return `<p id="${id}" class="ag-paragraph" data-muya-block="paragraph"><span class="ag-paragraph-content">${blockInlineHtml(block) || '<br>'}</span></p>`
}

export const muyaStateToHtml = (state) => (state?.blocks || []).map(renderBlock).join('')

export const renderMuyaStateIntoDom = (root, state) => {
  if (!root) return null
  root.id = 'ag-editor-id'
  root.classList.add('muya-runtime-editor', 'editor-component', 'ag-show-quick-insert-hint')
  root.setAttribute('contenteditable', 'true')
  root.setAttribute('autocorrect', 'false')
  root.setAttribute('autocomplete', 'off')
  root.setAttribute('spellcheck', 'true')
  root.setAttribute('data-muya-editor', 'true')
  root.setAttribute('data-muya-renderer', 'rust-compatible')
  root.innerHTML = muyaStateToHtml(state)
  return root
}

export const inlinePlainText = plainText
