const INSTALL_FLAG = '__ELEPHANT_ACCEPTANCE_PHYSICAL_SURFACE__'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let disposePdfViewerProbe = null
let droppedFileSequence = 0

const requireElement = (target, selector) => {
  if (!selector || typeof selector !== 'string') throw new TypeError('A CSS selector is required')
  const element = target.document?.querySelector?.(selector)
  if (!element) throw new Error(`Acceptance target was not found: ${selector}`)
  return element
}

const waitForFolderDropElement = async (target, folderTitle, timeoutMs = 10_000) => {
  const escapedTitle = target.CSS?.escape?.(folderTitle) || folderTitle.replace(/"/g, '\\"')
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const label = target.document?.querySelector?.(`.en-sidebar-tree-label[title="${escapedTitle}"]`)
    const row = label?.closest?.('.en-sidebar-tree-row')
    if (row) return row
    await wait(50)
  }
  throw new Error(`Acceptance folder drop target did not become visible: ${folderTitle}`)
}

const resolveDropElement = async (target, selector) => {
  const folderTitle = String(selector || '').match(/\.folder-name\[title="([^"]+)"\]/)?.[1]
  if (folderTitle) return waitForFolderDropElement(target, folderTitle)
  return requireElement(target, selector)
}

const bytesFromDescriptor = (descriptor) => {
  if (descriptor.contentBase64) {
    const binary = atob(descriptor.contentBase64)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }
  return new TextEncoder().encode(String(descriptor.content || ''))
}

const materializeDescriptor = async (target, descriptor) => {
  if (descriptor.path && descriptor.path !== descriptor.name) return descriptor
  if (!target.fileUtils?.writeFile || !target.path?.join) {
    throw new Error(`Unable to materialize dropped file ${descriptor.name}.`)
  }
  droppedFileSequence += 1
  const safeName = String(descriptor.name || 'file').replace(/[^A-Za-z0-9._-]/g, '-')
  const tempRoot = target.os?.tmpdir?.() || '/tmp'
  const path = target.path.join(
    tempRoot,
    `elephant-acceptance-drop-${Date.now()}-${droppedFileSequence}-${safeName}`
  )
  await target.fileUtils.writeFile(path, bytesFromDescriptor(descriptor), 'binary')
  return { ...descriptor, path }
}

const createDroppedFile = (target, descriptor) => {
  const bytes = bytesFromDescriptor(descriptor)
  const file = new target.File([bytes], descriptor.name, {
    type: descriptor.type || 'application/octet-stream',
    lastModified: Number(descriptor.lastModified || Date.now())
  })
  for (const [property, value] of [
    ['path', descriptor.path || descriptor.name],
    ['webkitRelativePath', descriptor.relativePath || '']
  ]) {
    try { Object.defineProperty(file, property, { configurable: true, value }) } catch {}
  }
  return file
}

const createTransfer = (target, descriptors) => {
  const transfer = typeof target.DataTransfer === 'function' ? new target.DataTransfer() : null
  if (!transfer) throw new Error('DataTransfer is unavailable in the packaged renderer')
  for (const descriptor of descriptors) transfer.items.add(createDroppedFile(target, descriptor))
  if (transfer.files.length !== descriptors.length) {
    throw new Error(`DataTransfer contains ${transfer.files.length} files instead of ${descriptors.length}`)
  }
  return transfer
}

const createDragEvent = (target, name, transfer, options = {}) => {
  const init = {
    dataTransfer: transfer,
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: Number(options.clientX || 20),
    clientY: Number(options.clientY || 20)
  }
  const event = new target.DragEvent(name, init)
  if (event.dataTransfer !== transfer) {
    try {
      Object.defineProperty(event, 'dataTransfer', {
        configurable: true,
        enumerable: true,
        value: transfer
      })
    } catch {}
  }
  if (event.dataTransfer !== transfer) {
    throw new Error(`Unable to attach DataTransfer to ${name}`)
  }
  return event
}

const textPointAt = (target, element, requestedOffset) => {
  const text = String(element.textContent || '')
  const offset = Number(requestedOffset)
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError(`Selection offset ${requestedOffset} is outside ${element.tagName} text length ${text.length}`)
  }
  const showText = target.NodeFilter?.SHOW_TEXT ?? 4
  const walker = element.ownerDocument.createTreeWalker(element, showText)
  let remaining = offset
  let node = walker.nextNode()
  let last = null
  while (node) {
    last = node
    const length = String(node.data || '').length
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }
  if (last) return { node: last, offset: String(last.data || '').length }
  return { node: element, offset: 0 }
}

const installSelectionOverride = (target, api) => {
  if (api.__elephantNestedTextSelection === true) return
  api.selectText = (selector, startOffset, endOffset = startOffset) => {
    const element = requireElement(target, selector)
    const selection = element.ownerDocument.defaultView?.getSelection?.()
    if (!selection) throw new Error('Selection API is unavailable')
    const start = textPointAt(target, element, startOffset)
    const end = textPointAt(target, element, endOffset)
    const range = element.ownerDocument.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    selection.removeAllRanges()
    selection.addRange(range)
    return api.readDom(selector)
  }
  Object.defineProperty(api, '__elephantNestedTextSelection', {
    value: true,
    enumerable: false
  })
}

const alignDomTextWithSelectionOffsets = (target, api) => {
  const originalReadDom = typeof api.readDom === 'function' ? api.readDom.bind(api) : null
  if (!originalReadDom || api.__elephantSelectionAlignedReadDom === true) return

  api.readDom = (selector) => {
    const result = originalReadDom(selector)
    const element = target.document?.querySelector?.(selector)
    const contentEditable = element?.isContentEditable || element?.getAttribute?.('contenteditable') === 'true'
    if (contentEditable) {
      result.renderedText = result.text
      result.text = String(element.textContent || '')
      result.selectionTextLength = result.text.length
    }
    return result
  }
  Object.defineProperty(api, '__elephantSelectionAlignedReadDom', {
    value: true,
    enumerable: false
  })
}

export const installAcceptancePhysicalSurface = async (target = globalThis) => {
  if (target[INSTALL_FLAG]) return target[INSTALL_FLAG]
  for (let attempt = 0; attempt < 2400; attempt += 1) {
    const api = target.__ELEPHANT_ACCEPTANCE_TEST__
    if (api) {
      alignDomTextWithSelectionOffsets(target, api)
      installSelectionOverride(target, api)

      api.pressShortcut = (selector, key, modifiers = {}) => {
        const element = requireElement(target, selector)
        element.focus?.()
        const init = {
          key,
          code: modifiers.code || '',
          bubbles: true,
          cancelable: true,
          composed: true,
          ctrlKey: modifiers.ctrlKey === true,
          metaKey: modifiers.metaKey === true,
          altKey: modifiers.altKey === true,
          shiftKey: modifiers.shiftKey === true,
          repeat: false
        }
        element.dispatchEvent(new target.KeyboardEvent('keydown', init))
        element.dispatchEvent(new target.KeyboardEvent('keyup', init))
        return api.readDom(selector)
      }

      api.pasteText = (selector, text) => {
        const element = requireElement(target, selector)
        element.focus?.()
        const transfer = new target.DataTransfer()
        transfer.setData('text/plain', String(text))
        transfer.setData('text/html', String(text))
        const event = new target.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true })
        element.dispatchEvent(event)
        return api.readDom(selector)
      }

      api.dropFiles = async (selector, descriptors, options = {}) => {
        const element = await resolveDropElement(target, selector)
        if (!Array.isArray(descriptors) || descriptors.length === 0) throw new TypeError('dropFiles requires file descriptors')
        const materialized = []
        for (const descriptor of descriptors) {
          materialized.push(await materializeDescriptor(target, descriptor))
        }
        const transfer = createTransfer(target, materialized)
        for (const name of ['dragenter', 'dragover', 'drop']) {
          element.dispatchEvent(createDragEvent(target, name, transfer, options))
        }
        return {
          selector,
          resolvedTarget: element.className || element.tagName,
          files: materialized.map(({ name, type, path, relativePath }) => ({ name, type, path, relativePath }))
        }
      }

      api.createFolder = async (relativePath) => {
        if (!relativePath || typeof relativePath !== 'string') throw new TypeError('createFolder requires a relative path')
        return target.__TAURI__?.core?.invoke('tauri_folders_create', { relativePath })
      }

      api.openSystemPath = async (path) => {
        if (!path || typeof path !== 'string') throw new TypeError('openSystemPath requires a path')
        return target.__TAURI__?.core?.invoke('plugin:opener|open_path', { path })
      }

      api.installPdfViewerProbe = () => {
        disposePdfViewerProbe?.()
        const host = target.__ELEPHANT_ADDON_HOST__
        if (typeof host?.provide !== 'function') throw new Error('Addon host is unavailable')
        disposePdfViewerProbe = host.provide('pdf.viewer', {
          open: async (path) => ({ handled: true, path, provider: 'acceptance-pdf-viewer' })
        })
        return { installed: true, resource: 'pdf.viewer' }
      }

      api.removePdfViewerProbe = () => {
        disposePdfViewerProbe?.()
        disposePdfViewerProbe = null
        return { installed: false, resource: 'pdf.viewer' }
      }

      api.readFileOpenHistory = () => [...(target.__ELEPHANT_FILE_OPEN_HISTORY__ || [])]
      api.clearFileOpenHistory = () => {
        target.__ELEPHANT_FILE_OPEN_HISTORY__ = []
        return []
      }

      target[INSTALL_FLAG] = api
      return api
    }
    await wait(25)
  }
  throw new Error('Acceptance API was not installed before physical-surface timeout')
}

void installAcceptancePhysicalSurface()
