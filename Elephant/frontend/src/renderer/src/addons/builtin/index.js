import './ui/addonPacksFeedback.css'
import { addonPacksAddon, addonProfilesAddon } from './addonProfiles'

const createLazyBuiltinAddon = ({ manifest, load, exportName }) => {
  let loadedAddonPromise = null

  const resolveAddon = async () => {
    if (!loadedAddonPromise) {
      loadedAddonPromise = Promise.resolve(load()).then((module) => {
        const addon = module?.[exportName]
        if (!addon?.manifest || addon.manifest.id !== manifest.id) {
          throw new Error(`Invalid lazy built-in addon module for ${manifest.id}`)
        }
        return addon
      })
    }
    return loadedAddonPromise
  }

  return Object.freeze({
    manifest: Object.freeze({ ...manifest }),
    async activate(ctx) {
      const addon = await resolveAddon()
      return addon.activate?.(ctx)
    },
    async deactivate(ctx) {
      const addon = await resolveAddon()
      return addon.deactivate?.(ctx)
    }
  })
}

export const googleKeepImportAddon = createLazyBuiltinAddon({
  exportName: 'googleKeepImportAddon',
  load: () => import('./googleKeepImport'),
  manifest: {
    id: 'elephant.google-keep-import',
    name: 'Google Keep Import',
    version: '1.0.0',
    description: 'Imports Google Keep archives, web pages and RSS feeds into the active vault.',
    author: 'ElephantNote',
    icon: 'download',
    defaultEnabled: false,
    removable: true,
    permissions: ['imports.google-keep', 'sources.web', 'sources.rss'],
    contributes: { settings: true }
  }
})

export const excalidrawAddon = createLazyBuiltinAddon({
  exportName: 'excalidrawAddon',
  load: () => import('./excalidraw'),
  manifest: {
    id: 'elephant.excalidraw',
    name: 'Excalidraw',
    version: '1.1.0',
    description: 'Adds Excalidraw drawings, editable image embeds and drawing cleanup to notes.',
    author: 'ElephantNote',
    icon: 'excalidraw',
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
  }
})

export const recentlyEditedAddon = createLazyBuiltinAddon({
  exportName: 'recentlyEditedAddon',
  load: () => import('./recentlyEdited'),
  manifest: {
    id: 'elephant.recently-edited',
    name: 'Recently edited',
    version: '1.0.0',
    description: 'Adds the recently edited notes section to the sidebar.',
    author: 'ElephantNote',
    icon: 'calendar-clock',
    defaultEnabled: false,
    removable: true,
    permissions: ['notes.read'],
    contributes: { layout: true }
  }
})

export {
  addonPacksAddon,
  addonProfilesAddon
}

export const builtinAddons = [
  addonPacksAddon,
  googleKeepImportAddon,
  excalidrawAddon,
  recentlyEditedAddon
]
