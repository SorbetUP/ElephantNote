const labelKey = block => {
  const { type, functionType, listType } = block
  if (type === 'figure') {
    return { table: 'table', html: 'html', multiplemath: 'mathblock' }[functionType]
  }
  if (type === 'pre') {
    if (/fencecode|indentcode/.test(functionType)) return 'pre'
    if (functionType === 'frontmatter') return 'frontMatter'
  }
  if (type === 'ul') return listType === 'task' ? 'ulTask' : 'ulBullet'
  const keys = {
    p: 'paragraph', ol: 'olOrder', blockquote: 'blockquote',
    h1: 'heading1', h2: 'heading2', h3: 'heading3',
    h4: 'heading4', h5: 'heading5', h6: 'heading6', hr: 'hr'
  }
  return keys[type] || 'paragraph'
}

export const createGetLabel = t => {
  const translate = t || (key => key)
  return block => {
    const key = labelKey(block)
    return key ? translate(`frontMenu.${key}`) : ''
  }
}

export const getLabel = createGetLabel()
