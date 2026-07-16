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

const mimeFromPath = (pathname = '') => {
  const ext = String(pathname || '').split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    default:
      return 'image/png'
  }
}

const bytesToBase64 = (bytes) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

const readLocalImageDataUrl = async (pathname = '') => {
  if (!pathname || !window.fileUtils?.pathExistsSync?.(pathname)) return ''
  const data = await window.fileUtils.readFile(pathname)
  if (data instanceof Blob) {
    const bytes = new Uint8Array(await data.arrayBuffer())
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(bytes)}`
  }
  if (data instanceof ArrayBuffer) {
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(new Uint8Array(data))}`
  }
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(bytes)}`
  }
  return ''
}

const isTransientLocalImageSource = (img) => {
  const source = String(img?.getAttribute('src') || img?.currentSrc || '').trim()
  return !img?.complete && /^(?:blob:|data:)/i.test(source)
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
  if (img?.dataset?.localImageLoaded === 'true') return
  const pathname = normalizeSlashes(localSourceToPath(source))
  if (!pathname || !EXCALIDRAW_ASSET_RE.test(pathname)) return
  if (isTransientLocalImageSource(img)) return
  const token = `${pathname}:${cacheBustSerial}`
  if (img.getAttribute(CACHE_BUST_ATTR) === token) return
  img.setAttribute(CACHE_BUST_ATTR, token)
  img.dataset.elephantExcalidrawPath = pathname
  const nextSrc = `${pathToDisplayUrl(pathname)}?v=${cacheBustSerial}`
  if (img.getAttribute('src') !== nextSrc) img.setAttribute('src', nextSrc)
}

const ensureEditButton = (img, source) => {
  const container = img.closest('.ag-image, .ag-image-container, .image-wrapper') || img.parentElement
  if (!container || container.getAttribute(INSTALLED_ATTR) === 'true') return
  container.setAttribute(INSTALLED_ATTR, 'true')
  container.classList.add('en-excalidraw-image-container')
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
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

const repairFailedImageContainer = async (container) => {
  if (!container?.classList?.contains('ag-image-fail')) return false
  const source = container.dataset.imageSrc || container.dataset.imageDomsrc || ''
  const pathname = normalizeSlashes(localSourceToPath(source))
  if (!pathname || !EXCALIDRAW_ASSET_RE.test(pathname)) return false
  const dataUrl = await readLocalImageDataUrl(pathname)
  if (!dataUrl) return false
  const imageContainer = container.querySelector('.ag-image-container') || container
  const existingImage = imageContainer.querySelector?.('img')
  if (existingImage) existingImage.remove()
  const img = document.createElement('img')
  img.dataset.originalSrc = source
  img.dataset.localPath = pathname
  img.dataset.elephantExcalidrawPath = pathname
  img.dataset.localImageLoaded = 'true'
  img.dataset.resolvedSrc = dataUrl
  img.src = dataUrl
  imageContainer.appendChild(img)
  container.classList.remove('ag-image-fail', 'ag-image-loading')
  container.classList.add('ag-image-success')
  container.removeAttribute('title')
  ensureEditButton(img, source)
  return true
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
  const failedContainers = document.querySelectorAll('.ag-image-fail[data-image-src], .ag-image-fail[data-image-domsrc]')
  for (const container of failedContainers) void repairFailedImageContainer(container)
  return repaired
}

const refreshAllDrawings = () => {
  cacheBustSerial = Date.now()
  repairAllImages()
}

const removeInstalledUi = () => {
  for (const button of document.querySelectorAll('.en-excalidraw-edit-button')) button.remove()
  for (const container of document.querySelectorAll(`[${INSTALLED_ATTR}]`)) {
    container.removeAttribute(INSTALLED_ATTR)
    container.classList.remove('en-excalidraw-image-container')
  }
  for (const img of document.querySelectorAll('.en-excalidraw-image')) {
    img.classList.remove('en-excalidraw-image')
    img.removeAttribute('title')
    img.removeAttribute(CACHE_BUST_ATTR)
    delete img.dataset.elephantExcalidrawPath
  }
}

export const installExcalidrawImageRuntimeFixes = (target = globalThis) => {
  if (!target?.document) return { dispose() {} }
  const existing = target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__
  if (existing?.dispose) return existing

  let disposed = false
  const repairSoon = () => {
    if (disposed) return
    const schedule = typeof target.requestAnimationFrame === 'function'
      ? target.requestAnimationFrame.bind(target)
      : (typeof target.setTimeout === 'function' ? target.setTimeout.bind(target) : globalThis.setTimeout.bind(globalThis))
    schedule(() => {
      if (!disposed) repairAllImages()
    })
  }
  const observer = new MutationObserver((records) => {
    if (disposed) return
    let closedDialog = false
    for (const record of records) {
      for (const node of record.removedNodes || []) {
        if (node?.nodeType === 1 && (node.matches?.('.en-excalidraw-overlay') || node.querySelector?.('.en-excalidraw-overlay'))) closedDialog = true
      }
    }
    if (closedDialog) {
      const delay = typeof target.setTimeout === 'function' ? target.setTimeout.bind(target) : globalThis.setTimeout.bind(globalThis)
      delay(() => {
        if (!disposed) refreshAllDrawings()
      }, 80)
      return
    }
    repairSoon()
  })
  const handleLoad = (event) => {
    if (!disposed && event.target?.tagName === 'IMG') repairImage(event.target)
  }
  const handleError = (event) => {
    if (!disposed && event.target?.tagName === 'IMG') repairImage(event.target)
  }

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src', 'class'] })
  document.addEventListener('load', handleLoad, true)
  document.addEventListener('error', handleError, true)
  bus.on('invalidate-image-cache', refreshAllDrawings)

  const runtime = {
    dispose() {
      disposed = true
      observer.disconnect()
      document.removeEventListener('load', handleLoad, true)
      document.removeEventListener('error', handleError, true)
      bus.off?.('invalidate-image-cache', refreshAllDrawings)
      removeInstalledUi()
      if (target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__ === runtime) {
        delete target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__
      }
    }
  }
  target.__ELEPHANT_EXCALIDRAW_IMAGE_RUNTIME_FIXES__ = runtime
  repairSoon()
  console.info('[excalidraw-image] runtime fixes installed')
  return runtime
}
