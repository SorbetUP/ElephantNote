import { MuyaRustLogicalDocument } from './logicalDocument'

const NODE_ATTRIBUTE = 'data-muya-rust-id'

const clone = (value) => JSON.parse(JSON.stringify(value))

const childElements = (element) =>
  Array.from(element.children).filter((child) => child.hasAttribute(NODE_ATTRIBUTE))

const safeUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(url)) return url
  return ''
}

export class MuyaRustDomRenderer {
  constructor(container, options = {}) {
    if (!container || typeof container.replaceChildren !== 'function') {
      throw new TypeError('Muya Rust DOM renderer requires an Element container.')
    }
    this.container = container
    this.ownerDocument = container.ownerDocument
    this.logical = new MuyaRustLogicalDocument()
    this.elements = new Map()
    this.onRender = options.onRender || null
  }

  applySnapshot(snapshot) {
    this.logical.loadSnapshot(snapshot)
    this.elements.clear()
    this.elements.set(this.logical.root, this.container)
    const root = this.logical.node(this.logical.root)
    const fragment = this.ownerDocument.createDocumentFragment()
    for (const childId of root.children) fragment.appendChild(this._renderSubtree(childId))
    this.container.replaceChildren(fragment)
    this.validateDom()
    this.onRender?.(this, snapshot)
  }

  applyPatches(patches, update) {
    this.logical.applyPatches(patches, update)
    for (const patch of patches) this._applyDomPatch(patch)
    this.validateDom()
    this.onRender?.(this, update)
  }

  restoreSelection(selection) {
    if (!selection) return
    const anchor = this._selectionPoint(selection.anchor)
    const focus = this._selectionPoint(selection.focus)
    const browserSelection = this.ownerDocument.defaultView?.getSelection?.()
    if (!browserSelection) return

    if (typeof browserSelection.setBaseAndExtent === 'function') {
      browserSelection.removeAllRanges()
      browserSelection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
      return
    }

    const range = this.ownerDocument.createRange()
    range.setStart(anchor.node, anchor.offset)
    range.setEnd(focus.node, focus.offset)
    browserSelection.removeAllRanges()
    browserSelection.addRange(range)
  }

  element(id) {
    return this.elements.get(Number(id)) || null
  }

  validateDom() {
    for (const [id, node] of this.logical.nodes) {
      const element = this.element(id)
      if (!element) throw new Error(`Muya Rust DOM element ${id} is missing.`)
      if (id === this.logical.root) continue

      const parent = this.element(node.parent)
      if (!parent) throw new Error(`Muya Rust DOM parent ${node.parent} is missing.`)
      if (element.parentElement !== parent) {
        throw new Error(`Muya Rust DOM node ${id} is attached to the wrong parent.`)
      }
      const actualChildren = childElements(element).map((child) => Number(child.getAttribute(NODE_ATTRIBUTE)))
      if (actualChildren.length !== node.children.length) {
        throw new Error(`Muya Rust DOM node ${id} has the wrong child count.`)
      }
      node.children.forEach((childId, index) => {
        if (actualChildren[index] !== childId) {
          throw new Error(`Muya Rust DOM child order differs at node ${id}.`)
        }
      })
    }

    if (this.elements.size !== this.logical.nodes.size) {
      throw new Error('Muya Rust DOM registry contains stale elements.')
    }
    return true
  }

  _applyDomPatch(patch) {
    switch (patch.type) {
      case 'replace_text':
        return this._syncText(patch.node)
      case 'insert_node': {
        const element = this._createElement(this.logical.node(patch.node.id))
        this._insertElement(patch.parent, patch.index, element)
        return
      }
      case 'insert_subtree': {
        const element = this._renderSubtree(patch.subtree.root)
        this._insertElement(patch.parent, patch.index, element)
        return
      }
      case 'move_node': {
        const element = this._requiredElement(patch.node)
        this._insertElement(patch.new_parent, patch.new_index, element)
        return
      }
      case 'remove_node':
        return this._removeElement(patch.node)
      case 'set_block_kind':
        return this._replaceElementShell(patch.node)
      default:
        throw new TypeError(`Unknown Muya Rust DOM patch: ${String(patch.type)}`)
    }
  }

  _renderSubtree(id) {
    const node = this.logical.node(id)
    if (!node) throw new Error(`Muya Rust logical node ${id} is missing.`)
    const element = this._createElement(node)
    for (const childId of node.children) element.appendChild(this._renderSubtree(childId))
    return element
  }

  _createElement(node) {
    if (!node) throw new Error('Cannot render an absent Muya Rust node.')
    const element = this._createElementForKind(node.kind)
    element.setAttribute(NODE_ATTRIBUTE, String(node.id))
    element.setAttribute('data-muya-rust-layer', node.kind.layer)
    if (node.kind.value?.type) element.setAttribute('data-muya-rust-kind', node.kind.value.type)
    this._applyIntrinsicContent(element, node)
    this.elements.set(node.id, element)
    return element
  }

  _createElementForKind(kind) {
    if (kind.layer === 'document') return this.ownerDocument.createElement('div')
    if (kind.layer === 'block') {
      const value = kind.value || {}
      switch (value.type) {
        case 'paragraph':
          return this.ownerDocument.createElement('p')
        case 'heading':
          return this.ownerDocument.createElement(`h${Math.min(6, Math.max(1, value.level || 1))}`)
        case 'block_quote':
          return this.ownerDocument.createElement('blockquote')
        case 'list':
          return this.ownerDocument.createElement(value.kind === 'ordered' ? 'ol' : 'ul')
        case 'list_item':
          return this.ownerDocument.createElement('li')
        case 'table':
          return this.ownerDocument.createElement('table')
        case 'table_row':
          return this.ownerDocument.createElement('tr')
        case 'table_cell':
          return this.ownerDocument.createElement(value.header ? 'th' : 'td')
        case 'code_block':
        case 'front_matter':
        case 'diagram':
          return this.ownerDocument.createElement('pre')
        case 'thematic_break':
          return this.ownerDocument.createElement('hr')
        default:
          return this.ownerDocument.createElement('div')
      }
    }

    const value = kind.value || {}
    switch (value.type) {
      case 'emphasis':
        return this.ownerDocument.createElement('em')
      case 'strong':
        return this.ownerDocument.createElement('strong')
      case 'strike':
        return this.ownerDocument.createElement('del')
      case 'code_span':
        return this.ownerDocument.createElement('code')
      case 'link':
      case 'auto_link':
        return this.ownerDocument.createElement('a')
      case 'image':
        return this.ownerDocument.createElement('img')
      case 'superscript':
      case 'footnote_reference':
        return this.ownerDocument.createElement('sup')
      case 'subscript':
        return this.ownerDocument.createElement('sub')
      case 'hard_break':
        return this.ownerDocument.createElement('br')
      default:
        return this.ownerDocument.createElement('span')
    }
  }

  _applyIntrinsicContent(element, node) {
    const kind = node.kind.value || {}
    switch (kind.type) {
      case 'text':
        element.setAttribute('data-muya-rust-text', '')
        element.appendChild(this.ownerDocument.createTextNode(kind.value || ''))
        break
      case 'escaped':
        element.textContent = kind.value || ''
        break
      case 'code_span':
        element.textContent = kind.code || ''
        break
      case 'image':
        element.setAttribute('alt', kind.alt || '')
        element.setAttribute('data-source', kind.source || '')
        if (safeUrl(kind.source)) element.setAttribute('src', safeUrl(kind.source))
        break
      case 'link':
      case 'auto_link': {
        const destination = kind.destination || ''
        element.setAttribute('data-destination', destination)
        if (safeUrl(destination)) element.setAttribute('href', safeUrl(destination))
        if (kind.title) element.setAttribute('title', kind.title)
        break
      }
      case 'inline_html':
        element.textContent = kind.raw || ''
        break
      case 'inline_math':
        element.textContent = kind.source || ''
        break
      case 'emoji':
        element.textContent = kind.value || kind.shortcode || ''
        break
      case 'footnote_reference':
        element.textContent = kind.label || ''
        break
      case 'soft_break':
        element.textContent = '\n'
        break
      default:
        break
    }

    if (node.kind.layer === 'block') {
      if (kind.type === 'list' && kind.kind === 'ordered' && kind.start) {
        element.setAttribute('start', String(kind.start))
      }
      if (kind.type === 'list' && kind.kind === 'task') {
        element.setAttribute('data-task-list', '')
      }
      if (kind.type === 'list_item' && kind.checked !== null && kind.checked !== undefined) {
        element.setAttribute('data-checked', String(Boolean(kind.checked)))
      }
      if (kind.type === 'table_cell') {
        element.setAttribute('data-alignment', kind.alignment || 'default')
      }
      if (kind.type === 'code_block' && kind.language) {
        element.setAttribute('data-language', kind.language)
      }
    }
  }

  _syncText(id) {
    const node = this.logical.node(id)
    const element = this._requiredElement(id)
    const value = node?.kind?.value?.value
    if (node?.kind?.value?.type !== 'text' || typeof value !== 'string') {
      throw new TypeError(`Muya Rust node ${id} is not text.`)
    }
    let text = element.firstChild
    if (!text || text.nodeType !== this.ownerDocument.defaultView.Node.TEXT_NODE) {
      element.replaceChildren(this.ownerDocument.createTextNode(value))
    } else {
      text.data = value
    }
  }

  _insertElement(parentId, index, element) {
    const parent = this._requiredElement(parentId)
    const children = childElements(parent).filter((child) => child !== element)
    const reference = children[index] || null
    parent.insertBefore(element, reference)
  }

  _removeElement(id) {
    const element = this._requiredElement(id)
    const descendants = [element, ...element.querySelectorAll(`[${NODE_ATTRIBUTE}]`)]
    for (const descendant of descendants) {
      this.elements.delete(Number(descendant.getAttribute(NODE_ATTRIBUTE)))
    }
    element.remove()
  }

  _replaceElementShell(id) {
    const node = this.logical.node(id)
    const previous = this._requiredElement(id)
    const replacement = this._createElement(node)
    while (previous.firstChild) replacement.appendChild(previous.firstChild)
    previous.replaceWith(replacement)
    this.elements.set(id, replacement)
  }

  _selectionPoint(point) {
    const node = this.logical.node(point?.node)
    const element = this._requiredElement(point?.node)
    if (node?.kind?.value?.type !== 'text') {
      throw new TypeError(`Muya Rust selection node ${String(point?.node)} is not text.`)
    }
    const text = element.firstChild
    if (!text || text.nodeType !== this.ownerDocument.defaultView.Node.TEXT_NODE) {
      throw new TypeError(`Muya Rust text DOM for node ${point.node} is missing.`)
    }
    const offset = Number(point.offset_utf16)
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.data.length) {
      throw new RangeError(`Muya Rust selection offset ${String(point.offset_utf16)} is invalid.`)
    }
    return { node: text, offset }
  }

  _requiredElement(id) {
    const element = this.element(id)
    if (!element) throw new Error(`Muya Rust DOM element ${String(id)} was not found.`)
    return element
  }
}

export const createDomPatchAdapter = (container, options = {}) => {
  const renderer = new MuyaRustDomRenderer(container, options)
  return {
    renderer,
    applySnapshot: (snapshot) => renderer.applySnapshot(snapshot),
    applyPatches: (patches, update) => renderer.applyPatches(patches, update),
    onSelection: (selection) => renderer.restoreSelection(selection)
  }
}

export { NODE_ATTRIBUTE }
