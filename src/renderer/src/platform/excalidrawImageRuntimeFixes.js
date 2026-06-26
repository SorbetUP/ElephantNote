import bus from '@/bus'
import { convertFileSrc } from '@tauri-apps/api/core'

const LOCAL_FILE_PREFIX = 'local-file://'
const EXCALIDRAW_ASSET_RE = /(?:^|\/)\.assets\/excalidraw-[^/?#]+\.png(?:[?#].*)?$/i
const INSTALLED_ATTR = 'data-elephant-excalidraw-edit-installed'
const CACHE_BUST_ATTR = 'data-elephant-excalidraw-cache-bust'

let cacheBustSerial = Date.now()

const normalizeSlashes = (value = '') => String(value || '').replace(/\\/g, '/')
const stripQueryAndHash = (value = '') => String(value || '').split(/[?#]/)[0]
const decodeSafe = (value = '') => {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

const localSourceToPath = (value = '') => {
  const text = stripQueryAndHash(value)
  if (text.startsWith(LOCAL_FILE_PREFIX)) return decodeSafe(text.slice(LOCAL_FILE_PREFIX.length))
  if (/^file:/i.test(text)) {
    try {
      return decodeSafe(new URL(text).pathname)
    } catch {
      return decodeSafe(text.replace(/^file:\/\//i, ''))
    }
  }
  return decodeSafe(text)
}

const pathToDisplayUrl = (pathname) => {
  try {
    return convertFileSrc(pathname)
  } catch {
    return `${LOCAL_FILE_PREFIX}${pathname}`
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
  return candidates.find((candidate) => EXCALIDRAW_ASSET_RE.test(normalizeSlashes(localSourceToPath(candidate)))) || ''
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

const refreshImageSource = (img, source) => {
  const pathname = normalizeSlashes(localSourceToPath(source))
  if (!pathname || !EXCALIDRAW_ASSET_RE.test(pathname)) return
  const token = `${pathname}:${cacheBustSerial}`
  if (img.getAttribute(CACHE_BUST_ATTR) === token) return
  img.setAttribute(CACHE_BUST_ATTR, token)
  img.dataset.elephantExcalidrawPath = pathname
  const nextSrc = `${pathToDisplayUrl(pathname)}?v=${cacheBustSerial}`
  if (img.getAttribute('src') !== nextSrc) {
    img.setAttribute('src', nextSrc)
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
    bus.emit('open-excalidraw-from-image', img.dataset.elephantExcalidrawPath || localSourceToPath(source))
  }, true)
  container.appendChild(button)
}

const repairImage = (img) => {
  const source = imageSource(img) || img.dataset.elephantExcalidrawPath || ''
  if (!source) return false
  removeLocalImageLoaders(img)
  refreshImageSource(img, source)
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

const refreshAllDrawings = () => {
  cacheBustSerial = Date.now()
  repairAllImages()
}

export const installExcalidrawImageRuntimeFixes = (target = globalThis) => {
  if (!target?.document || target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__) return false
  target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__ = true

  const repairSoon = () => {
    window.requestAnimationFrame(() => repairAllImages())
  }
  const observer = new MutationObserver((records) => {
    let closedDialog = false
    for (const record of records) {
      for (const node of record.removedNodes || []) {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.en-excalidraw-overlay') || node.querySelector?.('.en-excalidraw-overlay'))) {
          closedDialog = true
        }
      }
    }
    if (closedDialog) {
      window.setTimeout(refreshAllDrawings, 80)
      return
    }
    repairSoon()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src', 'class'] })
  document.addEventListener('load', (event) => {
    if (event.target?.tagName === 'IMG') repairImage(event.target)
  }, true)
  document.addEventListener('error', (event) => {
    if (event.target?.tagName === 'IMG') repairImage(event.target)
  }, true)
  bus.on('invalidate-image-cache', refreshAllDrawings)
  repairSoon()
  console.info('[excalidraw-image] runtime fixes installed')
  return true
}
