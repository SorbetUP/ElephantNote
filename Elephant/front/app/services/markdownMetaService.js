const isDateLikeString = (value) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(String(value || ''))

export const formatShortDate = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && !isDateLikeString(value)) return ''
  const date = new Date(value)
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export const relativeParentPath = (entryPath) => {
  if (!entryPath || !entryPath.includes('/')) return ''
  return entryPath.split('/').slice(0, -1).join('/')
}
