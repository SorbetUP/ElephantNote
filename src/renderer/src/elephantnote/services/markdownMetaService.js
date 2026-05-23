export const formatShortDate = (value) => {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value))
}

export const relativeParentPath = (entryPath) => {
  if (!entryPath || !entryPath.includes('/')) return ''
  return entryPath.split('/').slice(0, -1).join('/')
}
