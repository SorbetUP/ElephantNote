export const ensureRendererPathFacade = (target = globalThis) => {
  const scope = target.window || target
  scope.path = scope.path || {}
  const normalize = scope.path.normalize || ((value = '') => String(value || '').split('\\').join('/'))
  const join = scope.path.join || ((...parts) => normalize(parts.filter(Boolean).join('/')))

  if (typeof scope.path.normalize !== 'function') scope.path.normalize = normalize
  if (typeof scope.path.join !== 'function') scope.path.join = join
  if (typeof scope.path.resolve !== 'function') scope.path.resolve = (...parts) => join(...parts)
  if (typeof scope.path.basename !== 'function') {
    scope.path.basename = (value = '') => {
      const parts = normalize(value).split('/').filter(Boolean)
      return parts.at(-1) || ''
    }
  }
  if (typeof scope.path.dirname !== 'function') {
    scope.path.dirname = (value = '') => {
      const normalized = normalize(value)
      const parts = normalized.split('/').filter(Boolean)
      if (parts.length <= 1) return normalized.startsWith('/') ? '/' : '.'
      return `${normalized.startsWith('/') ? '/' : ''}${parts.slice(0, -1).join('/')}`
    }
  }
  if (typeof scope.path.isAbsolute !== 'function') {
    scope.path.isAbsolute = (value = '') => normalize(value).startsWith('/')
  }
  if (typeof scope.path.relative !== 'function') {
    scope.path.relative = (from = '', to = '') => {
      const fromParts = normalize(from).split('/').filter(Boolean)
      const toParts = normalize(to).split('/').filter(Boolean)
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift()
        toParts.shift()
      }
      return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
    }
  }

  return scope.path
}
