import { installExcalidrawMarkdownCleanup } from '../../platform/excalidrawMarkdownCleanup'
import { installExcalidrawImageRuntimeFixes } from '../../platform/excalidrawImageRuntimeFixes'

const ADDON_ID = 'elephant.excalidraw'

const dispatchLifecycle = (eventName) => {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  globalThis.dispatchEvent(new CustomEvent(eventName, { detail: { addonId: ADDON_ID } }))
}

export const excalidrawAddon = {
  manifest: {
    id: ADDON_ID,
    name: 'Excalidraw',
    version: '1.1.0',
    description: 'Adds Excalidraw drawings, editable image embeds and drawing cleanup to notes.',
    author: 'ElephantNote',
    icon: 'pen-tool',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read', 'notes.write', 'assets.read', 'assets.write'],
    contributes: { editor: true },
    contentTypes: [{
      id: 'drawing-image',
      kind: 'image',
      sourcePattern: '**/.assets/excalidraw-*.png',
      disabledPresentation: 'static-preview',
      disabledLabel: 'Excalidraw drawing'
    }]
  },

  activate() {
    globalThis.__ELEPHANT_EXCALIDRAW_ENABLED__ = true
    document.documentElement.dataset.elephantExcalidrawEnabled = 'true'
    const cleanupRuntime = installExcalidrawMarkdownCleanup()
    const imageRuntime = installExcalidrawImageRuntimeFixes(globalThis)
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
