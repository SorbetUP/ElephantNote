import { installExcalidrawMarkdownCleanup } from '../../platform/excalidrawMarkdownCleanup'
import { installExcalidrawImageRuntimeFixes } from '../../platform/excalidrawImageRuntimeFixes'

const ADDON_ID = 'elephant.excalidraw'
const EXCALIDRAW_ASSET_RE = /(?:^|\/)\.assets\/excalidraw-[^/?#]+\.png(?:[?#].*)?$/i
const EXCALIDRAW_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTgiIGZpbGw9IiM2QzYzRkYiLz48cGF0aCBkPSJNMjAgNDRjNy41LTE1LjUgMTUuNS0yMy41IDI0LTI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTE4IDQ2bDgtMi02LTYtMiA4eiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik00MiAxOGw0IDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjIyIiByPSI0IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuODUiLz48cGF0aCBkPSJNNDIgNDJoNyIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iLjg1Ii8+PC9zdmc+'

const normalizeSource = (value = '') => String(value || '')
  .replaceAll('\\', '/')
  .split(/[?#]/)[0]

const imageSource = (imageInfo = {}) => imageInfo.token?.attrs?.src || imageInfo.token?.src || ''
const isExcalidrawImage = (imageInfo) => EXCALIDRAW_ASSET_RE.test(normalizeSource(imageSource(imageInfo)))

const editDrawing = ({ imageInfo, muya }) => {
  const src = imageSource(imageInfo)
  if (typeof muya?.options?.elephantnoteCommandHandler === 'function') {
    muya.options.elephantnoteCommandHandler('edit-excalidraw-image', { src, imageInfo })
    return
  }
  globalThis.dispatchEvent?.(new CustomEvent('elephantnote-writing-command', {
    detail: {
      command: 'edit-excalidraw-image',
      payload: { src }
    }
  }))
}

const dispatchLifecycle = (eventName) => {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail: { addonId: ADDON_ID } }))
}

export const excalidrawAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Excalidraw',
    version: '1.2.0',
    description: 'Adds Excalidraw drawings, editable image embeds and drawing cleanup to notes.',
    author: 'ElephantNote',
    icon: 'pen-tool',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read', 'notes.write', 'assets.read', 'assets.write'],
    contributes: {
      editor: true,
      contentTypes: [{
        id: 'drawing-image',
        kind: 'image',
        sourcePattern: '**/.assets/excalidraw-*.png',
        disabledPresentation: 'static-preview',
        disabledLabel: 'Excalidraw drawing'
      }]
    }
  },

  activate(ctx) {
    globalThis.__ELEPHANT_EXCALIDRAW_ENABLED__ = true
    document.documentElement.dataset.elephantExcalidrawEnabled = 'true'
    const cleanupRuntime = installExcalidrawMarkdownCleanup()
    const imageRuntime = installExcalidrawImageRuntimeFixes(globalThis)

    ctx.addEditorExtension({
      id: `${ADDON_ID}.image-toolbar`,
      imageToolbarItems: [{
        id: 'edit-drawing',
        tooltip: 'Edit Excalidraw drawing',
        icon: EXCALIDRAW_ICON,
        localOnly: true,
        when: ({ imageInfo }) => isExcalidrawImage(imageInfo),
        run: editDrawing
      }]
    })

    globalThis.__ELEPHANT_ADDON_CONTENT_FALLBACKS__?.refresh?.()
    dispatchLifecycle('elephantnote:excalidraw-addon-enabled')

    return () => {
      cleanupRuntime?.dispose?.()
      imageRuntime?.dispose?.()
      delete globalThis.__ELEPHANT_EXCALIDRAW_ENABLED__
      delete document.documentElement.dataset.elephantExcalidrawEnabled
      queueMicrotask(() => globalThis.__ELEPHANT_ADDON_CONTENT_FALLBACKS__?.refresh?.())
      dispatchLifecycle('elephantnote:excalidraw-addon-disabled')
    }
  }
}
