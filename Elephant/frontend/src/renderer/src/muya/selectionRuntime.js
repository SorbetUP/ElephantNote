export const nodePath = (root, node) => {
  const path = []
  let current = node
  while (current && current !== root) {
    const parent = current.parentNode
    if (!parent) break
    path.unshift([...parent.childNodes].indexOf(current))
    current = parent
  }
  return path
}

export const nodeFromPath = (root, path = []) => path.reduce((node, index) => node?.childNodes?.[index] || null, root)

export const nodeLength = (node) => node?.nodeType === 3 ? node.nodeValue.length : node?.childNodes?.length || 0

const editorSelection = (root, selection = null) => (
  selection ||
  root?.ownerDocument?.defaultView?.getSelection?.() ||
  globalThis.getSelection?.() ||
  null
)

export const createSelectionSnapshot = (root, selection = null) => {
  const resolvedSelection = editorSelection(root, selection)
  if (!root || !resolvedSelection || resolvedSelection.rangeCount === 0) return null
  const range = resolvedSelection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return {
    anchor: nodePath(root, range.startContainer),
    anchorOffset: range.startOffset,
    focus: nodePath(root, range.endContainer),
    focusOffset: range.endOffset,
    collapsed: range.collapsed
  }
}

export const restoreSelectionSnapshot = (root, snapshot, doc = root?.ownerDocument || globalThis.document) => {
  if (!root || !snapshot || !doc?.createRange) return false
  const anchor = nodeFromPath(root, snapshot.anchor)
  const focus = nodeFromPath(root, snapshot.focus)
  if (!anchor || !focus) return false
  const selection = editorSelection(root)
  if (!selection) return false
  const range = doc.createRange()
  try {
    range.setStart(anchor, Math.min(snapshot.anchorOffset, nodeLength(anchor)))
    range.setEnd(focus, Math.min(snapshot.focusOffset, nodeLength(focus)))
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}

export const createDomEditor = (root, doc = root?.ownerDocument || globalThis.document) => {
  if (!root || !doc) return null
  root.setAttribute('contenteditable', 'true')
  root.setAttribute('data-muya-editor', 'true')
  root.setAttribute('spellcheck', 'true')
  return {
    root,
    setHtml(html = '') { root.innerHTML = html; return root },
    getHtml() { return root.innerHTML },
    getText() { return root.textContent || '' },
    snapshotSelection() { return createSelectionSnapshot(root) },
    restoreSelection(snapshot) { return restoreSelectionSnapshot(root, snapshot, doc) },
    focus() { root.focus?.() }
  }
}
