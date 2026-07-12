export function isAllowedTransformation(block, toType, isMultilineSelection) {
  const fromType = this.getTypeFromBlock(block)
  if (toType === 'front-matter') return true
  if (!fromType) return false
  if (isMultilineSelection && /heading|table/.test(toType)) return false
  if (fromType === toType || toType === 'reset-to-paragraph') return true

  switch (fromType) {
    case 'ul-bullet':
    case 'ul-task':
    case 'ol-order':
    case 'blockquote':
    case 'paragraph':
      if (/hr|table/.test(toType) && block.text) return false
      return true
    case 'heading 1':
    case 'heading 2':
    case 'heading 3':
    case 'heading 4':
    case 'heading 5':
    case 'heading 6':
      return /paragraph|heading/.test(toType)
    default:
      return false
  }
}
