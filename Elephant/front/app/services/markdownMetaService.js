export const formatShortDate = (value) => {
  if (!value) return ''
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
