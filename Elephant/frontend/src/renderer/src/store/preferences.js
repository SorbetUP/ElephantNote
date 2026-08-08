import { defineStore } from 'pinia'
import bus from '../bus'
import { setLanguage } from '../i18n'
import {
  hydratePortablePreferences,
  hydrateDurablePreferences,
  hydratePortableUserData,
  hydrateDurableUserData,
  persistPortablePreference,
  persistPortableUserData,
  isPortableRuntime
} from '../platform/preferenceStorage'

const reportDurablePreferenceError = (operation, error) => {
  console.error(`[elephantnote:preferences] ${operation} failed`, error)
}

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    autoSave: false,
    autoSaveDelay: 5000,
    pinnedCardHalo: false,
    iconRailOrder: ['dashboard', 'wiki', 'graph', 'models', 'search', 'chat'],
    iconRailHidden: [],
    showTagHashInEditor: true,
    noteEditorMargin: 24,
    titleBarStyle: 'custom',
    openFilesInNewWindow: false,
    openFolderInNewWindow: false,
    zoom: 1.0,
    hideScrollbar: false,
    wordWrapInToc: false,
    fileSortBy: 'created',
    startUpAction: 'restoreAll',
    restoreLayoutState: true,
    defaultDirectoryToOpen: '',
    lastOpenedFolder: '',
    treePathExcludePatterns: [],
    language: 'en',

    editorFontFamily: 'Open Sans',
    fontSize: 16,
    lineHeight: 1.6,
    codeFontSize: 14,
    codeFontFamily: 'DejaVu Sans Mono',
    codeBlockLineNumbers: true,
    trimUnnecessaryCodeBlockEmptyLines: true,
    wrapCodeBlocks: true,
    editorLineWidth: '',

    autoPairBracket: true,
    autoPairMarkdownSyntax: true,
    autoPairQuote: true,
    endOfLine: 'default',
    defaultEncoding: 'utf8',
    autoGuessEncoding: true,
    autoNormalizeLineEndings: false,

    trimTrailingNewline: 2,
    textDirection: 'ltr',
    hideQuickInsertHint: false,
    quickInsertTrigger: '/',
    imageInsertAction: 'folder',
    imagePreferRelativeDirectory: false,
    imageRelativeDirectoryBase: 'file',
    imageRelativeDirectoryName: 'assets',
    hideLinkPopup: false,
    autoCheck: false,

    preferLooseListItem: true,
    bulletListMarker: '-',
    orderListDelimiter: '.',
    preferHeadingStyle: 'atx',
    tabSize: 4,
    listIndentation: 1,
    frontmatterType: '-',
    superSubScript: false,
    footnote: false,
    isHtmlEnabled: true,
    isGitlabCompatibilityEnabled: false,
    sequenceTheme: 'hand',

    theme: 'light',
    followSystemTheme: true,
    lightModeTheme: 'light',
    darkModeTheme: 'dark',
    customCss: '',

    spellcheckerEnabled: false,
    spellcheckerNoUnderline: false,
    spellcheckerLanguage: 'en-US',

    // Default values that are overwritten with the entries below.
    sideBarVisibility: false,
    tabBarVisibility: false,
    sourceCodeModeEnabled: false,

    searchExclusions: [],
    searchMaxFileSize: '',
    searchIncludeHidden: false,
    searchNoIgnore: false,
    searchFollowSymlinks: true,

    watcherUsePolling: false,

    // --------------------------------------------------------------------------

    // Edit modes of the current window (not part of persistent settings)
    typewriter: false, // typewriter mode
    focus: false, // focus mode
    sourceCode: false, // source code mode

    // user configration
    imageFolderPath: '',
    webImages: [],
    cloudImages: [],
    currentUploader: 'none',
    githubToken: '',
    imageBed: {
      github: {
        owner: '',
        repo: '',
        branch: ''
      }
    },
    cliScript: ''
  }),

  getters: {
    getAll: (state) => state
  },

  actions: {
    SET_USER_PREFERENCE(preference) {
      const oldLanguage = this.language

      Object.keys(preference).forEach((key) => {
        if (typeof preference[key] !== 'undefined' && typeof this[key] !== 'undefined') {
          this[key] = preference[key]
        }
      })

      // Update i18n language if language preference changed
      if (preference.language && preference.language !== oldLanguage) {
        setLanguage(preference.language)
      }
    },
    SET_MODE({ type, checked }) {
      if (type === 'sourceCode') {
        // The desktop editor is Rust Muya-only. Keep legacy IPC/preferences
        // messages from remounting the editor as the removed CodeMirror view.
        this.sourceCode = false
        return
      }
      this[type] = checked
    },
    TOGGLE_VIEW_MODE(entryName) {
      this[entryName] = !this[entryName]
    },
    async ASK_FOR_USER_PREFERENCE() {
      if (isPortableRuntime()) {
        // Hydrate the synchronous WebView cache immediately, then let the
        // atomic Tauri preference store authoritatively override it. The Tauri
        // store survives abrupt process termination; localStorage alone does
        // not provide that crash-durability guarantee on WebKitGTK.
        this.SET_USER_PREFERENCE(hydratePortablePreferences(this.$state))
        const portableUserData = hydratePortableUserData(this.$state)
        Object.entries(portableUserData).forEach(([type, value]) => {
          this.SET_USER_DATA({ type, value, persist: false })
        })
        try {
          this.SET_USER_PREFERENCE(await hydrateDurablePreferences(this.$state))
          const durableUserData = await hydrateDurableUserData(this.$state)
          Object.entries(durableUserData).forEach(([type, value]) => {
            this.SET_USER_DATA({ type, value, persist: false })
          })
        } catch (error) {
          reportDurablePreferenceError('hydrate durable state', error)
        }
        return
      }
      window.tauri.ipcRenderer.send('mt::ask-for-user-preference')
      window.tauri.ipcRenderer.send('mt::ask-for-user-data')

      window.tauri.ipcRenderer.on('mt::user-preference', (e, preferences) => {
        this.SET_USER_PREFERENCE(preferences)
      })
    },

    SET_SINGLE_PREFERENCE({ type, value }) {
      // Update local state
      this[type] = value

      // Update i18n language if language preference changed
      if (type === 'language') {
        setLanguage(value)
      }

      // Persist to both the synchronous WebView cache and the atomic Tauri
      // store. The latter is the crash-durable source of truth.
      persistPortablePreference(type, value).catch((error) => {
        reportDurablePreferenceError(`persist ${type}`, error)
      })
      if (isPortableRuntime()) {
        return
      }
      window.tauri.ipcRenderer.send('mt::set-user-preference', { [type]: value })
    },

    SET_USER_DATA({ type, value, persist = true }) {
      this[type] = value
      if (persist) {
        persistPortableUserData(type, value).catch((error) => {
          reportDurablePreferenceError(`persist user data ${type}`, error)
        })
      }
      if (isPortableRuntime()) {
        return
      }
      window.tauri.ipcRenderer.send('mt::set-user-data', { [type]: value })
    },

    SET_IMAGE_FOLDER_PATH(value) {
      if (isPortableRuntime()) {
        this.imageFolderPath = value
        persistPortableUserData('imageFolderPath', value).catch((error) => {
          reportDurablePreferenceError('persist image folder', error)
        })
        return
      }
      window.tauri.ipcRenderer.send('mt::ask-for-modify-image-folder-path', value)
    },

    SELECT_DEFAULT_DIRECTORY_TO_OPEN() {
      if (isPortableRuntime()) {
        return
      }
      window.tauri.ipcRenderer.send('mt::select-default-directory-to-open')
    },

    LISTEN_FOR_VIEW() {
      window.tauri?.ipcRenderer?.on('mt::show-command-palette', () => {
        bus.emit('show-command-palette')
      })
      window.tauri?.ipcRenderer?.on('mt::toggle-view-mode-entry', (event, entryName) => {
        this.TOGGLE_VIEW_MODE(entryName)
        this.DISPATCH_EDITOR_VIEW_STATE({ [entryName]: this[entryName] })
      })
    },

    // Toggle a view option and notify main process to toggle menu item.
    LISTEN_TOGGLE_VIEW() {
      bus.on('view:toggle-view-entry', (entryName) => {
        if (entryName === 'sourceCode') {
          this.sourceCode = false
          return
        }
        this.TOGGLE_VIEW_MODE(entryName)
        this.DISPATCH_EDITOR_VIEW_STATE({ [entryName]: this[entryName] })
      })
    },

    DISPATCH_EDITOR_VIEW_STATE(viewState) {
      const { windowId } = global.marktext.env
      window.tauri.ipcRenderer.send('mt::view-layout-changed', windowId, viewState)
    }
  }
})
