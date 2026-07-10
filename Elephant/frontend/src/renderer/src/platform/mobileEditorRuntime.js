import bus from '@/bus'

const RUNTIME_FLAG = '__ELEPHANTNOTE_MOBILE_EDITOR_RUNTIME__'
const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  }
}

const isMobile = (target = globalThis) => Boolean(
  target.matchMedia?.('(max-width: 760px), (hover: none) and (pointer: coarse)').matches
)

const icon = (name) => {
  const icons = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    camera: '<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3z"/><circle cx="12" cy="13" r="3"/>',
    draw: '<path d="m12 19 7-7 3 3-7 7-4 1zM18 13l-1.5-1.5"/><path d="M2 20c2-4 5-5 9-4"/>',
    format: '<path d="M4 20h16M7 16 12 4l5 12M9 12h6"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
    redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a7 7 0 0 0-7 7"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5H4v8h4M14 21c3 0 7-1 7-8V5h-6v8h4"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.more}</svg>`
}

const button = ({ label, iconName, action, compact = false }) => {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = compact ? 'en-mobile-editor-button compact' : 'en-mobile-sheet-action'
  element.dataset.action = action
  element.setAttribute('aria-label', label)
  element.innerHTML = `${icon(iconName)}${compact ? '' : `<span>${label}</span>`}`
  return element
}

const getVaultRoot = async (target) => {
  const invoke = target.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error('The Android vault backend is unavailable.')
  const payload = await invoke('tauri_vaults_get')
  const root = String(payload?.activeVault?.path || '')
  if (!root) throw new Error('Select a vault before adding media.')
  return root
}

const extensionForType = (type = '') => {
  if (/png/i.test(type)) return 'png'
  if (/webp/i.test(type)) return 'webp'
  if (/gif/i.test(type)) return 'gif'
  return 'jpg'
}

const saveAsset = async (target, blob, preferredName = '') => {
  const vaultRoot = await getVaultRoot(target)
  const extension = extensionForType(blob?.type)
  const rawName = preferredName || `mobile-${Date.now()}.${extension}`
  const safeName = String(rawName).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `mobile-${Date.now()}.${extension}`
  const assetsDir = target.path.join(vaultRoot, '.assets')
  const destination = target.path.join(assetsDir, safeName)
  await target.fileUtils.ensureDir(assetsDir)
  await target.fileUtils.writeFile(destination, blob)
  bus.emit('insert-image', destination)
  target.dispatchEvent(new CustomEvent('elephantnote:vault-files-changed'))
  return destination
}

const createSheet = (title, actions) => {
  const backdrop = document.createElement('div')
  backdrop.className = 'en-mobile-editor-sheet-backdrop'
  backdrop.innerHTML = `
    <section class="en-mobile-editor-sheet" role="dialog" aria-modal="true" aria-label="${title}">
      <header><strong>${title}</strong><button type="button" aria-label="Close">${icon('close')}</button></header>
      <div class="en-mobile-editor-sheet-actions"></div>
    </section>
  `
  const actionHost = backdrop.querySelector('.en-mobile-editor-sheet-actions')
  for (const action of actions) actionHost.appendChild(button(action))
  const close = () => backdrop.remove()
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('header button')) close()
  })
  return { backdrop, close }
}

const openCamera = async (target, onCaptured) => {
  const backdrop = document.createElement('div')
  backdrop.className = 'en-mobile-camera-backdrop'
  backdrop.innerHTML = `
    <section class="en-mobile-camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video autoplay playsinline muted></video>
      <div class="en-mobile-camera-actions">
        <button type="button" data-camera="cancel">Cancel</button>
        <button type="button" class="capture" data-camera="capture" aria-label="Take photo"></button>
        <button type="button" data-camera="switch">Switch</button>
      </div>
      <p class="en-mobile-camera-error" aria-live="polite"></p>
    </section>
  `
  document.body.appendChild(backdrop)
  const video = backdrop.querySelector('video')
  const errorHost = backdrop.querySelector('.en-mobile-camera-error')
  let stream = null
  let facingMode = 'environment'

  const stop = () => {
    stream?.getTracks?.().forEach((track) => track.stop())
    backdrop.remove()
  }

  const start = async () => {
    stream?.getTracks?.().forEach((track) => track.stop())
    try {
      stream = await target.navigator.mediaDevices.getUserMedia({
        ...CAMERA_CONSTRAINTS,
        video: { ...CAMERA_CONSTRAINTS.video, facingMode: { ideal: facingMode } }
      })
      video.srcObject = stream
      await video.play()
      errorHost.textContent = ''
    } catch (error) {
      errorHost.textContent = error?.name === 'NotAllowedError'
        ? 'Camera permission was refused. Enable it in Android settings and try again.'
        : `Unable to open camera: ${error?.message || error}`
    }
  }

  backdrop.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-camera]')?.dataset.camera
    if (action === 'cancel') stop()
    if (action === 'switch') {
      facingMode = facingMode === 'environment' ? 'user' : 'environment'
      await start()
    }
    if (action === 'capture' && video.videoWidth > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (blob) await onCaptured(blob)
      stop()
    }
  })

  await start()
}

const chooseGalleryImage = (target, onPicked) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  // Deliberately no `capture` attribute: Samsung WebView routes that path
  // through setPhotoOptions, which fails on several Android versions.
  input.hidden = true
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (file) await onPicked(file)
    input.remove()
  }, { once: true })
  document.body.appendChild(input)
  input.click()
}

const runCommand = (command) => {
  bus.emit('elephantnote-writing-command', command)
}

const insertActions = (target) => [
  { label: 'Take a photo', iconName: 'camera', action: 'camera' },
  { label: 'Add an image', iconName: 'image', action: 'gallery' },
  { label: 'Drawing', iconName: 'draw', action: 'excalidraw' },
  { label: 'Checklist', iconName: 'check', action: 'tasks' },
  { label: 'Bullet list', iconName: 'list', action: 'bullets' },
  { label: 'Numbered list', iconName: 'list', action: 'numbers' },
  { label: 'Quote', iconName: 'quote', action: 'quote' },
  { label: 'Table', iconName: 'table', action: 'table' },
  { label: 'Horizontal rule', iconName: 'more', action: 'horizontal-rule' }
]

const formattingActions = () => [
  { label: 'Body text', iconName: 'format', action: 'paragraph' },
  { label: 'Heading 1', iconName: 'format', action: 'heading-1' },
  { label: 'Heading 2', iconName: 'format', action: 'heading-2' },
  { label: 'Bold', iconName: 'format', action: 'bold' },
  { label: 'Italic', iconName: 'format', action: 'italic' },
  { label: 'Strikethrough', iconName: 'format', action: 'strike' },
  { label: 'Inline code', iconName: 'format', action: 'code' },
  { label: 'Link', iconName: 'format', action: 'link' }
]

const attachSheetActions = (target, sheet) => {
  sheet.backdrop.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (!action) return
    sheet.close()
    if (action === 'camera') {
      await openCamera(target, (blob) => saveAsset(target, blob, `photo-${Date.now()}.jpg`))
      return
    }
    if (action === 'gallery') {
      chooseGalleryImage(target, (file) => saveAsset(target, file, file.name))
      return
    }
    runCommand(action)
  })
}

const createToolbar = (target) => {
  const toolbar = document.createElement('nav')
  toolbar.className = 'en-mobile-editor-toolbar'
  toolbar.setAttribute('aria-label', 'Note editing tools')
  toolbar.append(
    button({ label: 'Insert', iconName: 'plus', action: 'insert', compact: true }),
    button({ label: 'Formatting', iconName: 'format', action: 'format', compact: true }),
    button({ label: 'Undo', iconName: 'undo', action: 'undo', compact: true }),
    button({ label: 'Redo', iconName: 'redo', action: 'redo', compact: true }),
    button({ label: 'More', iconName: 'more', action: 'more', compact: true })
  )

  toolbar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (!action) return
    if (action === 'undo' || action === 'redo') {
      bus.emit(action)
      return
    }
    const actions = action === 'format'
      ? formattingActions()
      : insertActions(target)
    const title = action === 'format' ? 'Formatting' : 'Insert'
    const sheet = createSheet(title, actions)
    attachSheetActions(target, sheet)
    document.body.appendChild(sheet.backdrop)
  })
  return toolbar
}

const syncToolbar = (target) => {
  const noteOpen = isMobile(target) && !!target.document.querySelector('.en-main.has-editor-open .en-editor-layer')
  const existing = target.document.querySelector('.en-mobile-editor-toolbar')
  if (!noteOpen) {
    existing?.remove()
    return
  }
  if (existing) return
  target.document.querySelector('.en-editor-layer')?.appendChild(createToolbar(target))
}

export const installMobileEditorRuntime = (target = globalThis) => {
  if (!target?.document || target[RUNTIME_FLAG]) return false
  target[RUNTIME_FLAG] = true
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    target.requestAnimationFrame(() => {
      scheduled = false
      syncToolbar(target)
    })
  }
  const observer = new target.MutationObserver(schedule)
  observer.observe(target.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  target.addEventListener('resize', schedule)
  schedule()
  target.__ELEPHANTNOTE_MOBILE_EDITOR_DISPOSE__ = () => {
    observer.disconnect()
    target.removeEventListener('resize', schedule)
    target.document.querySelector('.en-mobile-editor-toolbar')?.remove()
    target[RUNTIME_FLAG] = false
  }
  return true
}

installMobileEditorRuntime()
