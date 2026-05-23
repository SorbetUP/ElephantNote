let excalidrawModulePromise = null

export const ensurePngName = (name) => {
  const base = (name || 'excalidraw').trim() || 'excalidraw'
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`
}

export const loadExcalidrawModule = async() => {
  if (typeof window !== 'undefined' && typeof window.EXCALIDRAW_ASSET_PATH !== 'string') {
    try {
      window.EXCALIDRAW_ASSET_PATH = new URL('/excalidraw-assets/', window.location.origin).toString()
    } catch {
      window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/'
    }
  }

  excalidrawModulePromise ??= import('@excalidraw/excalidraw')
  return excalidrawModulePromise
}

const blobToImageSize = async(blob) => {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = url
    })
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const isEmptyScene = (data) => {
  const elements = Array.isArray(data?.elements) ? data.elements : []
  const nonDeleted = elements.filter((element) => element && element.isDeleted !== true)
  const files = data?.files && typeof data.files === 'object' ? data.files : null
  const fileCount = files ? Object.keys(files).length : 0
  return nonDeleted.length === 0 && fileCount === 0
}

const createSceneFromImageBlob = async(blob, theme) => {
  const { getDataURL, MIME_TYPES } = await loadExcalidrawModule()
  const now = Date.now()
  const fileId = crypto?.randomUUID?.() || `${now}-${Math.random()}`
  const dataURL = await getDataURL(blob)
  const { width: naturalWidth, height: naturalHeight } = await blobToImageSize(blob)
  const maxW = 1200
  const maxH = 900
  const scale = Math.min(1, maxW / Math.max(1, naturalWidth), maxH / Math.max(1, naturalHeight))
  const width = Math.round(naturalWidth * scale)
  const height = Math.round(naturalHeight * scale)
  const seed = Math.floor(Math.random() * 2147483647)
  const versionNonce = Math.floor(Math.random() * 2147483647)

  return {
    elements: [
      {
        id: crypto?.randomUUID?.() || `${now}-${Math.random()}`,
        type: 'image',
        x: 0,
        y: 0,
        strokeColor: '#000000',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roundness: null,
        roughness: 0,
        opacity: 100,
        width,
        height,
        angle: 0,
        seed,
        version: 1,
        versionNonce,
        index: null,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        fileId,
        status: 'saved',
        scale: [1, 1],
        crop: null
      }
    ],
    files: {
      [fileId]: {
        id: fileId,
        dataURL,
        mimeType: blob.type || MIME_TYPES.png,
        created: now,
        lastRetrieved: now
      }
    },
    appState: {
      viewBackgroundColor: theme === 'dark' ? '#121212' : '#ffffff',
      exportBackground: true,
      exportEmbedScene: true
    }
  }
}

export const createInitialExcalidrawData = async({ blob, theme }) => {
  if (!blob) {
    return {
      elements: [],
      files: {},
      appState: {
        viewBackgroundColor: theme === 'dark' ? '#121212' : '#ffffff',
        exportBackground: true,
        exportEmbedScene: true
      }
    }
  }

  const { loadFromBlob } = await loadExcalidrawModule()
  try {
    const restored = await loadFromBlob(blob, null, null)
    if (isEmptyScene(restored)) {
      return createSceneFromImageBlob(blob, theme)
    }
    return restored
  } catch {
    return createSceneFromImageBlob(blob, theme)
  }
}

export const exportExcalidrawBlob = async({ api, theme }) => {
  const { exportToBlob, MIME_TYPES } = await loadExcalidrawModule()
  return exportToBlob({
    elements: api.getSceneElements(),
    appState: {
      ...api.getAppState(),
      exportBackground: true,
      exportEmbedScene: true,
      viewBackgroundColor: theme === 'dark' ? '#121212' : '#ffffff'
    },
    files: api.getFiles(),
    mimeType: MIME_TYPES.png,
    embedScene: true
  })
}
