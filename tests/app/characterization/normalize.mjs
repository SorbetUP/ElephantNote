const blockScalarKeys = [
  'type',
  'functionType',
  'text',
  'editable',
  'lang',
  'marker',
  'headingStyle',
  'listItemType',
  'bulletMarkerOrDelimiter',
  'isLooseListItem',
  'start',
  'checked',
  'align',
  'codeBlockStyle',
  'mathStyle',
  'htmlType',
  'meta'
]

const isDomNode = (value) => value && typeof value === 'object' && typeof value.nodeType === 'number'

export const buildBlockKeyMap = (blocks) => {
  const map = new Map()
  const walk = (items, prefix = 'root') => {
    items.forEach((block, index) => {
      const path = `${prefix}.${index}`
      if (block?.key) map.set(block.key, path)
      if (block?.children?.length) walk(block.children, path)
    })
  }
  walk(blocks || [])
  return map
}

const normalizePrimitive = (value, keyMap) => {
  if (typeof value === 'string' && keyMap.has(value)) return keyMap.get(value)
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  return value
}

export const normalizeValue = (value, keyMap = new Map(), seen = new WeakSet()) => {
  if (value == null || typeof value !== 'object') return normalizePrimitive(value, keyMap)
  if (isDomNode(value)) {
    return {
      nodeName: value.nodeName,
      className: typeof value.className === 'string' ? value.className : '',
      textContent: value.textContent || ''
    }
  }
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, keyMap, seen))

  const output = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (typeof item === 'function') continue
    output[key] = normalizeValue(item, keyMap, seen)
  }
  return output
}

const normalizeLink = (key, keyMap) => key == null ? null : keyMap.get(key) || '[unknown-key]'

export const normalizeBlocks = (blocks) => {
  const keyMap = buildBlockKeyMap(blocks)
  const walk = (block) => {
    const output = {
      path: keyMap.get(block.key),
      parent: normalizeLink(block.parent, keyMap),
      previous: normalizeLink(block.preSibling, keyMap),
      next: normalizeLink(block.nextSibling, keyMap)
    }
    for (const key of blockScalarKeys) {
      if (Object.prototype.hasOwnProperty.call(block, key)) {
        output[key] = normalizeValue(block[key], keyMap)
      }
    }
    output.children = (block.children || []).map(walk)
    return output
  }
  return {
    keyMap,
    value: (blocks || []).map(walk)
  }
}

export const normalizeCursor = (cursor, keyMap) => {
  if (!cursor) return null
  const point = (value) => value && ({
    path: keyMap.get(value.key) || '[unknown-key]',
    offset: value.offset
  })
  return {
    start: point(cursor.start),
    end: point(cursor.end),
    anchor: point(cursor.anchor),
    focus: point(cursor.focus),
    isEdit: Boolean(cursor.isEdit),
    isInit: Boolean(cursor.isInit),
    noHistory: Boolean(cursor.noHistory)
  }
}

const canonicalizeDynamicIds = (html, keyMap) => {
  let value = html
  for (const [key, path] of [...keyMap.entries()].sort((a, b) => b[0].length - a[0].length)) {
    value = value.split(key).join(`block:${path}`)
  }
  const dynamic = new Map()
  let next = 0
  return value.replace(/ag-[a-z0-9-]+/gi, (match) => {
    if (!dynamic.has(match)) dynamic.set(match, `ag-dynamic-${next++}`)
    return dynamic.get(match)
  })
}

export const normalizeDom = (container, keyMap) => {
  if (!container) return null
  const clone = container.cloneNode(true)
  clone.querySelectorAll('[contenteditable]').forEach((node) => {
    if (node.getAttribute('contenteditable') === '') node.setAttribute('contenteditable', 'true')
  })
  const html = clone.outerHTML
    .replace(/ style=""/g, '')
    .replace(/>\s+</g, '><')
  return canonicalizeDynamicIds(html, keyMap)
}

export const firstDifference = (reference, candidate, path = '$') => {
  if (Object.is(reference, candidate)) return null
  if (typeof reference !== typeof candidate) return { path, reference, candidate }
  if (reference == null || candidate == null || typeof reference !== 'object') {
    return { path, reference, candidate }
  }
  if (Array.isArray(reference) !== Array.isArray(candidate)) return { path, reference, candidate }
  if (Array.isArray(reference)) {
    if (reference.length !== candidate.length) return { path: `${path}.length`, reference: reference.length, candidate: candidate.length }
    for (let index = 0; index < reference.length; index += 1) {
      const diff = firstDifference(reference[index], candidate[index], `${path}[${index}]`)
      if (diff) return diff
    }
    return null
  }
  const referenceKeys = Object.keys(reference).sort()
  const candidateKeys = Object.keys(candidate).sort()
  const keysDiff = firstDifference(referenceKeys, candidateKeys, `${path}.[keys]`)
  if (keysDiff) return keysDiff
  for (const key of referenceKeys) {
    const diff = firstDifference(reference[key], candidate[key], `${path}.${key}`)
    if (diff) return diff
  }
  return null
}
