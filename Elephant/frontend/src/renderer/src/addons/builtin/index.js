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

export const codexConnectionAddon = createLazyBuiltinAddon({
  exportName: 'codexConnectionAddon',
  load: () => import('./codexConnection'),
  manifest: {
    id: 'elephant.codex-connection',
    name: 'Codex Connection',
    version: '1.0.0',
    description: 'Connects a ChatGPT subscription and exposes Codex as an ElephantNote chat provider.',
    author: 'ElephantNote',
    icon: 'openai',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.provider', 'codex.account', 'codex.models', 'codex.usage'],
    contributes: { settings: true, aiProvider: true }
  }
})

export const calendarAddon = createLazyBuiltinAddon({
  exportName: 'calendarAddon',
  load: () => import('./calendar'),
  manifest: {
    id: 'elephant.calendar',
    name: 'Calendar',
    version: '1.1.0',
    description: 'Restores the native ElephantNote calendar workspace for offline events, imported calendars and recently edited notes.',
    author: 'ElephantNote',
    icon: 'calendar-days',
    defaultEnabled: false,
    removable: true,
    permissions: ['calendar.read', 'calendar.sync'],
    contributes: { actions: true, views: true }
  }
})

export const sitesAddon = createLazyBuiltinAddon({
  exportName: 'sitesAddon',
  load: () => import('./sites'),
  manifest: {
    id: 'elephant.sites',
    name: 'Sites',
    version: '1.0.0',
    description: 'Builds, opens and stops the existing ElephantNote static site preview.',
    author: 'ElephantNote',
    icon: 'globe-2',
    defaultEnabled: false,
    removable: true,
    permissions: ['sites.build', 'sites.preview'],
    contributes: { settings: true, siteGenerator: true, layout: true }
  }
})

export const aiAddon = createLazyBuiltinAddon({
  exportName: 'aiAddon',
  load: () => import('./ai'),
  manifest: {
    id: 'elephant.ai',
    name: 'AI',
    version: '1.0.0',
    description: 'Adds AI providers, chat, semantic search, OCR, Wiki, Graph and the local model library.',
    author: 'ElephantNote',
    icon: 'sparkles',
    defaultEnabled: false,
    removable: true,
    permissions: ['ai.configure', 'ai.chat', 'ai.models', 'search.manage', 'ocr.run'],
    contributes: { actions: true, sidebar: true, settings: true, views: true, layout: true }
  }
})

export const syncAddon = createLazyBuiltinAddon({
  exportName: 'syncAddon',
  load: () => import('./sync'),
  manifest: {
    id: 'elephant.sync',
    name: 'Sync',
    version: '1.0.0',
    description: 'Adds encrypted Iroh device pairing, synchronization and conflict recovery.',
    author: 'ElephantNote',
    icon: 'cloud',
    defaultEnabled: false,
    removable: true,
    permissions: ['sync.status', 'sync.pair', 'sync.run', 'sync.conflicts'],
    contributes: { settings: true, topBar: true }
  }
})

export const codeExecutionAddon = createLazyBuiltinAddon({
  exportName: 'codeExecutionAddon',
  load: () => import('./codeExecution'),
  manifest: {
    id: 'elephant.code-execution',
    name: 'Code execution',
    version: '1.1.0',
    description: 'Runs trusted fenced code blocks with locally installed interpreters.',
    author: 'ElephantNote',
    icon: 'terminal',
    defaultEnabled: false,
    removable: true,
    permissions: ['programs.list', 'programs.configure', 'programs.run'],
    contributes: { settings: true, editor: true }
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
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  aiAddon,
  syncAddon,
  codeExecutionAddon,
  excalidrawAddon,
  recentlyEditedAddon
]
