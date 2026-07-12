export const CORE_ICON_RAIL_ITEMS = Object.freeze([
  { id: 'dashboard', label: 'Dashboard', description: 'Overview of the active vault.' },
  { id: 'search', label: 'Search', description: 'Open global search.' }
])

export const DEFAULT_ICON_RAIL_ORDER = Object.freeze(
  CORE_ICON_RAIL_ITEMS.map((item) => item.id)
)

export const ICON_RAIL_SEPARATOR_PREFIX = 'separator:'

const normalizeIds = (values) => {
  if (!Array.isArray(values)) return []
  const result = []
  const seen = new Set()
  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export const addonViewRailId = (viewId) => `addon-view:${String(viewId || '').trim()}`
export const isIconRailSeparatorId = (id) => String(id || '').startsWith(ICON_RAIL_SEPARATOR_PREFIX)
export const createIconRailSeparatorId = () => `${ICON_RAIL_SEPARATOR_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const normalizeIconRailOrder = (order, availableIds) => {
  const available = normalizeIds(availableIds)
  const allowed = new Set(available)
  const normalized = normalizeIds(order).filter((id) => allowed.has(id) || isIconRailSeparatorId(id))
  const seen = new Set(normalized)
  for (const id of available) {
    if (!seen.has(id)) normalized.push(id)
  }
  return normalized
}

export const normalizeIconRailHidden = (hidden, availableIds) => {
  const allowed = new Set(normalizeIds(availableIds))
  return normalizeIds(hidden).filter((id) => allowed.has(id) && !isIconRailSeparatorId(id))
}

export const moveIconRailItem = (order, id, targetIndex) => {
  const normalized = normalizeIds(order)
  const currentIndex = normalized.indexOf(id)
  if (currentIndex === -1) return normalized
  const boundedIndex = Math.max(0, Math.min(normalized.length - 1, Number(targetIndex) || 0))
  if (boundedIndex === currentIndex) return normalized
  const next = [...normalized]
  next.splice(currentIndex, 1)
  next.splice(boundedIndex, 0, id)
  return next
}
