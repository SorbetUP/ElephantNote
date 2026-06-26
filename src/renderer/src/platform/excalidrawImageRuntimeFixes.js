import bus from '@/bus'

const LOCAL_FILE_PREFIX = 'local-file://'
const EXCALIDRAW_ASSET_RE = /(?:^|\/)\.assets\/excalidraw-[^/?#]+\.png(?:[?#].*)?$/i
const INSTALLED_ATTR = 'data-elephant-excalidraw-edit-installed'

const normalizeSlashes = (value = '') => String(value || '').replace(/\\/g, '/')

const decodeSafe = (value = '') => {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

const localFileUrlToPath = (value = '') => {
  const text = String(value || '')
  if (text.startsWith(LOCAL_FILE_PREFIX)) return decodeSafe(text.slice(LOCAL_FILE_PREFIX.length))
  if (!/^file:/i.test(text)) return text
  try {
    const url = new URL(text)
    return decodeSafe(url.pathname)
  } catch {
    return text.replace(/^file:\/\//i, '')
  }
}

const imageSource = (img) => {
  const candidates = [
    img.getAttribute('data-src'),
    img.getAttribute('data-origin-src'),
    img.getAttribute('data-original-src'),
    img.getAttribute('src'),
    img.currentSrc
  ].filter(Boolean)
  return candidates.find((candidate) => EXCALIDRAW_ASSET_RE.test(normalizeSlashes(localFileUrlToPath(candidate)))) || ''
}

const removeLocalImageLoaders = (img) => {
  const root = img.closest('.ag-image, .ag-image-container, .image-wrapper, p, div') || img.parentElement
  if (!root) return
  const loaders = root.querySelectorAll('[class*="loading"], [class*="spinner"], .ag-image-loading, .image-loading')
  for (const loader of loaders) {
    if (loader === img || loader.contains(img)) continue
    loader.style.display = 'none'
    loader.style.opacity = '0'
    loader.style.pointerEvents = 'none'
    loader.setAttribute('aria-hidden', 'true')
  }
}

const ensureEditButton = (img, source) => {
  const container = img.closest('.ag-image, .ag-image-container, .image-wrapper') || img.parentElement
  if (!container || container.getAttribute(INSTALLED_ATTR) === 'true') return
  container.setAttribute(INSTALLED_ATTR, 'true')
  container.classList.add('en-excalidraw-image-container')
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }
  img.classList.add('en-excalidraw-image')
  img.setAttribute('title', 'Edit Excalidraw drawing')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'en-excalidraw-edit-button'
  button.textContent = '✎ Excalidraw'
  button.title = 'Edit Excalidraw drawing'
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  }, true)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    bus.emit('open-excalidraw-from-image', localFileUrlToPath(source))
  }, true)
  container.appendChild(button)
}

const repairImage = (img) => {
  const source = imageSource(img)
  if (!source) return false
  removeLocalImageLoaders(img)
  ensureEditButton(img, source)
  return true
}

const repairAllImages = () => {
  const images = document.querySelectorAll('img')
  let repaired = 0
  for (const img of images) {
    if (repairImage(img)) repaired += 1
  }
  return repaired
}

export const installExcalidrawImageRuntimeFixes = (target = globalThis) => {
  if (!target?.document || target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__) return false
  target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__ = true

  const repairSoon = () => {
    window.requestAnimationFrame(() => repairAllImages())
  }
  const observer = new MutationObserver(repairSoon)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src', 'class'] })
  document.addEventListener('load', (event) => {
    if (event.target?.tagName === 'IMG') repairImage(event.target)
  }, true)
  bus.on('invalidate-image-cache', repairSoon)
  repairSoon()
  console.info('[excalidraw-image] runtime fixes installed')
  return true
}
