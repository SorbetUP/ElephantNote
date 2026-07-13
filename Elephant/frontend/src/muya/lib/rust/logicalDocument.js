const clone = (value) => JSON.parse(JSON.stringify(value))

const assertNodeId = (value, label = 'node id') => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Invalid ${label}: ${String(value)}`)
  }
  return value
}

const utf16Boundary = (value, offset) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length) return false
  if (offset === 0 || offset === value.length) return true
  const previous = value.charCodeAt(offset - 1)
  const current = value.charCodeAt(offset)
  const previousIsHigh = previous >= 0xd800 && previous <= 0xdbff
  const currentIsLow = current >= 0xdc00 && current <= 0xdfff
  return !(previousIsHigh && currentIsLow)
}

const textValue = (node) => {
  if (node?.kind?.layer !== 'inline' || node.kind?.value?.type !== 'text') {
    throw new TypeError(`Node ${String(node?.id)} is not an editable text node.`)
  }
  return node.kind.value.value
}

export class MuyaRustLogicalDocument {
  constructor(snapshot = null) {
    this.root = null
    this.revision = 0
    this.nodes = new Map()
    if (snapshot) this.loadSnapshot(snapshot)
  }

  loadSnapshot(snapshot) {
    const document = snapshot?.document
    if (!document || !Array.isArray(document.nodes)) {
      throw new TypeError('Muya Rust snapshot has no logical document tree.')
    }

    const next = new MuyaRustLogicalDocument()
    next.root = assertNodeId(document.root, 'document root')
    next.revision = this._revision(snapshot.revision)
    for (const rawNode of document.nodes) {
      const node = clone(rawNode)
      assertNodeId(node.id)
      if (next.nodes.has(node.id)) {
        throw new TypeError(`Duplicate Muya Rust node id ${node.id}.`)
      }
      if (!Array.isArray(node.children)) {
        throw new TypeError(`Node ${node.id} has no children array.`)
      }
      node.children.forEach((child) => assertNodeId(child, `child of ${node.id}`))
      if (node.parent !== null && node.parent !== undefined) {
        assertNodeId(node.parent, `parent of ${node.id}`)
      } else {
        node.parent = null
      }
      next.nodes.set(node.id, node)
    }
    next.validate()
    this._replaceWith(next)
    return this
  }

  applyPatches(patches, update) {
    if (!Array.isArray(patches)) {
      throw new TypeError('Muya Rust patches must be an array.')
    }
    const revision = this._revision(update?.revision)
    const expectedRevision = this.revision + (patches.length > 0 ? 1 : 0)
    if (revision !== expectedRevision) {
      throw new Error(
        `Muya Rust logical revision mismatch: expected ${expectedRevision}, received ${revision}.`
      )
    }

    const next = this.clone()
    for (const patch of patches) next._applyPatch(patch)
    next.revision = revision
    next.validate()
    this._replaceWith(next)
    return this
  }

  node(id) {
    return this.nodes.get(id) || null
  }

  clone() {
    const next = new MuyaRustLogicalDocument()
    next.root = this.root
    next.revision = this.revision
    next.nodes = new Map(Array.from(this.nodes, ([id, node]) => [id, clone(node)]))
    return next
  }

  toProtocolDocument() {
    const nodes = []
    const append = (id) => {
      const node = this.nodes.get(id)
      if (!node) throw new Error(`Missing Muya Rust node ${id}.`)
      nodes.push(clone(node))
      node.children.forEach(append)
    }
    append(this.root)
    return { root: this.root, nodes }
  }

  validate() {
    assertNodeId(this.root, 'document root')
    const root = this.nodes.get(this.root)
    if (!root) throw new Error(`Muya Rust root node ${this.root} is missing.`)
    if (root.parent !== null) throw new Error('Muya Rust root node must not have a parent.')

    const visited = new Set()
    const active = new Set()
    const visit = (id) => {
      if (active.has(id)) throw new Error(`Muya Rust logical tree contains a cycle at node ${id}.`)
      if (visited.has(id)) throw new Error(`Muya Rust node ${id} appears more than once.`)
      const node = this.nodes.get(id)
      if (!node) throw new Error(`Muya Rust child node ${id} is missing.`)
      active.add(id)
      visited.add(id)
      for (const childId of node.children) {
        const child = this.nodes.get(childId)
        if (!child) throw new Error(`Muya Rust child node ${childId} is missing.`)
        if (child.parent !== id) {
          throw new Error(`Muya Rust node ${childId} does not point back to parent ${id}.`)
        }
        visit(childId)
      }
      active.delete(id)
    }
    visit(this.root)
    if (visited.size !== this.nodes.size) {
      throw new Error('Muya Rust logical tree contains unreachable nodes.')
    }
    return true
  }

  _applyPatch(patch) {
    if (!patch || typeof patch !== 'object') {
      throw new TypeError('Muya Rust patch must be an object.')
    }
    switch (patch.type) {
      case 'replace_text':
        return this._replaceText(patch)
      case 'insert_node':
        return this._insertNode(patch.parent, patch.index, patch.node)
      case 'insert_subtree':
        return this._insertSubtree(patch.parent, patch.index, patch.subtree)
      case 'move_node':
        return this._moveNode(patch.node, patch.new_parent, patch.new_index)
      case 'remove_node':
        return this._removeNode(patch.node)
      case 'set_block_kind':
        return this._setBlockKind(patch.node, patch.kind)
      default:
        throw new TypeError(`Unknown Muya Rust patch type: ${String(patch.type)}`)
    }
  }

  _replaceText(patch) {
    const node = this._requiredNode(patch.node)
    const value = textValue(node)
    const start = patch.range?.start
    const end = patch.range?.end
    if (!utf16Boundary(value, start) || !utf16Boundary(value, end) || start > end) {
      throw new RangeError(`Invalid UTF-16 range ${String(start)}..${String(end)} for node ${node.id}.`)
    }
    node.kind.value.value = value.slice(0, start) + String(patch.inserted) + value.slice(end)
  }

  _insertNode(parentId, index, rawNode) {
    const parent = this._requiredNode(parentId)
    this._assertInsertIndex(parent, index)
    const node = clone(rawNode)
    assertNodeId(node?.id)
    if (this.nodes.has(node.id)) throw new Error(`Muya Rust node ${node.id} already exists.`)
    if (!Array.isArray(node.children) || node.children.length !== 0) {
      throw new Error(`Inserted Muya Rust node ${node.id} must be detached and childless.`)
    }
    node.parent = parent.id
    this.nodes.set(node.id, node)
    parent.children.splice(index, 0, node.id)
  }

  _insertSubtree(parentId, index, subtree) {
    const parent = this._requiredNode(parentId)
    this._assertInsertIndex(parent, index)
    if (!subtree || !Array.isArray(subtree.nodes)) {
      throw new TypeError('Inserted Muya Rust subtree is invalid.')
    }
    const rootId = assertNodeId(subtree.root, 'subtree root')
    const incoming = new Map()
    for (const rawNode of subtree.nodes) {
      const node = clone(rawNode)
      assertNodeId(node.id)
      if (incoming.has(node.id) || this.nodes.has(node.id)) {
        throw new Error(`Muya Rust subtree node ${node.id} already exists.`)
      }
      incoming.set(node.id, node)
    }
    if (!incoming.has(rootId)) throw new Error(`Muya Rust subtree root ${rootId} is missing.`)
    for (const node of incoming.values()) {
      if (!Array.isArray(node.children)) throw new Error(`Subtree node ${node.id} has no children.`)
      for (const childId of node.children) {
        const child = incoming.get(childId)
        if (!child || child.parent !== node.id) {
          throw new Error(`Muya Rust subtree relation ${node.id} -> ${childId} is invalid.`)
        }
      }
      if (node.id !== rootId && !incoming.has(node.parent)) {
        throw new Error(`Muya Rust subtree node ${node.id} has an external parent.`)
      }
    }
    incoming.get(rootId).parent = parent.id
    for (const [id, node] of incoming) this.nodes.set(id, node)
    parent.children.splice(index, 0, rootId)
  }

  _moveNode(nodeId, parentId, index) {
    const node = this._requiredNode(nodeId)
    if (node.id === this.root) throw new Error('Muya Rust root node cannot be moved.')
    const oldParent = this._requiredNode(node.parent)
    const oldIndex = oldParent.children.indexOf(node.id)
    if (oldIndex < 0) throw new Error(`Muya Rust node ${node.id} is absent from its parent.`)
    oldParent.children.splice(oldIndex, 1)

    const parent = this._requiredNode(parentId)
    this._assertInsertIndex(parent, index)
    let ancestor = parent
    while (ancestor) {
      if (ancestor.id === node.id) throw new Error('Muya Rust node cannot move into its subtree.')
      ancestor = ancestor.parent === null ? null : this.nodes.get(ancestor.parent)
    }
    parent.children.splice(index, 0, node.id)
    node.parent = parent.id
  }

  _removeNode(nodeId) {
    const node = this._requiredNode(nodeId)
    if (node.id === this.root) throw new Error('Muya Rust root node cannot be removed.')
    const parent = this._requiredNode(node.parent)
    const index = parent.children.indexOf(node.id)
    if (index < 0) throw new Error(`Muya Rust node ${node.id} is absent from its parent.`)
    parent.children.splice(index, 1)

    const remove = (id) => {
      const current = this._requiredNode(id)
      current.children.slice().forEach(remove)
      this.nodes.delete(id)
    }
    remove(node.id)
  }

  _setBlockKind(nodeId, kind) {
    const node = this._requiredNode(nodeId)
    if (node.kind?.layer !== 'block') {
      throw new TypeError(`Node ${node.id} is not a block node.`)
    }
    node.kind.value = clone(kind)
  }

  _requiredNode(id) {
    assertNodeId(id)
    const node = this.nodes.get(id)
    if (!node) throw new Error(`Muya Rust node ${id} was not found.`)
    return node
  }

  _assertInsertIndex(parent, index) {
    if (!Number.isSafeInteger(index) || index < 0 || index > parent.children.length) {
      throw new RangeError(`Invalid child index ${String(index)} for Muya Rust node ${parent.id}.`)
    }
  }

  _revision(value) {
    const revision = Number(value)
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new TypeError(`Invalid Muya Rust revision: ${String(value)}`)
    }
    return revision
  }

  _replaceWith(other) {
    this.root = other.root
    this.revision = other.revision
    this.nodes = other.nodes
  }
}

export const createLogicalPatchAdapter = (options = {}) => {
  const document = new MuyaRustLogicalDocument()
  return {
    document,
    applySnapshot: async (snapshot) => {
      document.loadSnapshot(snapshot)
      await options.onCommit?.(document, snapshot)
    },
    applyPatches: async (patches, update) => {
      document.applyPatches(patches, update)
      await options.onCommit?.(document, update)
    }
  }
}
