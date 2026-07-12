export const isValidCursorNode = node => {
  if (!node) return false
  if (node.nodeType === 3) node = node.parentNode
  return node.closest('span.ag-paragraph')
}
