export const EXCALIDRAW_MIME = 'application/vnd.excalidraw+json'

export const EXCALIDRAW_LIGHT_BACKGROUND = '#ffffff'
export const EXCALIDRAW_DARK_BACKGROUND = '#121212'

export const ensurePngName = (name) => {
  const base = (name || 'excalidraw').trim() || 'excalidraw'
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`
}

export const ensureExcalidrawName = (name) => {
  const base = (name || 'drawing').trim() || 'drawing'
  return base.toLowerCase().endsWith('.excalidraw') ? base : `${base}.excalidraw`
}

const splitPath = (pathname = '') => {
  const value = String(pathname || '')
  const normalized = value.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  const directory = slashIndex >= 0 ? normalized.slice(0, slashIndex) : ''
  const filename = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized
  return { directory, filename }
}

export const getPathExtension = (pathname = '') => {
  const { filename } = splitPath(pathname)
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 ? filename.slice(dotIndex) : ''
}

export const stripPathExtension = (pathname = '') => {
  const extension = getPathExtension(pathname)
  return extension ? String(pathname).slice(0, -extension.length) : String(pathname || '')
}

export const getPathBasename = (pathname = '', extension = '') => {
  const { filename } = splitPath(pathname)
  if (extension && filename.toLowerCase().endsWith(extension.toLowerCase())) {
    return filename.slice(0, -extension.length)
  }
  return filename
}

export const getPathDirectory = (pathname = '') => splitPath(pathname).directory

export const joinPath = (...parts) => parts
  .filter((part) => part !== undefined && part !== null && String(part).length > 0)
  .join('/')
  .replace(/\/+/g, '/')

export const getExcalidrawScenePath = (pathname) => {
  if (!pathname) return ''
  const extension = getPathExtension(pathname)
  if (extension.toLowerCase() === '.excalidraw') return pathname
  return `${stripPathExtension(pathname)}.excalidraw`
}

export const getExcalidrawPreviewPath = (pathname) => {
  const scenePath = getExcalidrawScenePath(pathname)
  if (!scenePath) return ''
  return joinPath(
    getPathDirectory(scenePath),
    `${getPathBasename(scenePath, '.excalidraw')}.png`
  )
}

export const getExcalidrawSidecarPath = getExcalidrawScenePath

export const normalizeExcalidrawBaseName = (value, fallback = 'excalidraw') => {
  return String(value || '')
    .replace(/\.excalidraw\.png$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.png$/i, '')
    .trim() || fallback
}

export const getExcalidrawBackgroundColor = (theme) =>
  theme === 'dark' ? EXCALIDRAW_DARK_BACKGROUND : EXCALIDRAW_LIGHT_BACKGROUND

export const createEmptyExcalidrawScene = (theme) => ({
  elements: [],
  files: {},
  appState: {
    viewBackgroundColor: getExcalidrawBackgroundColor(theme),
    exportBackground: true,
    exportEmbedScene: true
  }
})
