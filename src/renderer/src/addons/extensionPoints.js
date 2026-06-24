export const ADDON_EXTENSION_POINTS = Object.freeze({
  actions: 'actions',
  sidebarItems: 'sidebar.items',
  settingsSections: 'settings.sections',
  views: 'views',
  editorExtensions: 'editor.extensions',
  statusBarItems: 'statusbar.items'
})

export const isKnownExtensionPoint = (area) => {
  return Object.values(ADDON_EXTENSION_POINTS).includes(area)
}
