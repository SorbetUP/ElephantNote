import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const appearance = () => read('Elephant/shared/appearance.js')
const appMessages = () => read('Elephant/frontend/app/i18n/appMessages.js')
const i18n = () => read('Elephant/frontend/src/renderer/src/i18n/index.js')
const settings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const appShell = () => read('Elephant/frontend/app/components/shell/AppShell.vue')
const excalidrawDialog = () => read('Elephant/frontend/app/components/editor/ExcalidrawDialog.vue')
const imageToolbar = () => read('Elephant/frontend/src/muya/lib/ui/imageToolbar/config.js')
const noteTopBar = () => read('Elephant/frontend/app/components/editor/NoteEditorTopBar.vue')
const noteFooter = () => read('Elephant/frontend/app/components/editor/NoteEditorFooter.vue')
const noteStyles = () => read('Elephant/frontend/app/styles/note-editor-redesign.css')

describe('expanded ElephantNote experience', () => {
  it('registers beige, pastel and gamer violet as full light/dark theme families', () => {
    const source = appearance()

    for (const family of ['beige', 'pastel', 'gamer-violet']) {
      expect(source).toContain(`id: '${family}'`)
      expect(source).toContain(`light: '${family}-light'`)
      expect(source).toContain(`dark: '${family}-dark'`)
      expect(source).toContain(`'${family}-light': createThemeTokens`)
      expect(source).toContain(`'${family}-dark': createThemeTokens`)
    }
    expect(source).toContain("floatShadow: '0 0 34px rgba(168, 85, 247, 0.24)")
  })

  it('centralizes app messages and exposes every ISO 639-1 language with fallback', () => {
    const source = appMessages()

    expect(source).toContain("import ISO6391 from 'iso-639-1'")
    expect(source).toContain('ISO6391.getAllCodes()')
    expect(source).toContain('new Intl.DisplayNames')
    expect(source).toContain('mergeMessages(english, builtInMessages[normalized] || {})')
    expect(source).toContain("['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi']")
    expect(source).toContain("code: 'system'")
  })

  it('uses the central locale registry in the renderer and applies RTL direction', () => {
    const source = i18n()

    expect(source).toContain("from 'elephant-front/i18n/appMessages'")
    expect(source).toContain('document.documentElement.lang = locale')
    expect(source).toContain("document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr'")
    expect(source).toContain("globalThis.localStorage?.setItem(APP_LANGUAGE_STORAGE_KEY, preference)")
    expect(source).toContain("new CustomEvent('elephantnote:language-changed'")
  })

  it('offers language selection and the new theme families from Settings', () => {
    const source = settings()

    expect(source).toContain('getLanguageOptions')
    expect(source).toContain('v-model="languagePreference"')
    expect(source).toContain('@change="changeLanguage"')
    expect(source).toContain("type: 'language'")
    expect(source).toContain('const themeFamilies = ELEPHANTNOTE_THEME_FAMILIES')
    expect(source).toContain("label: 'Theme'")
    expect(source).toContain('Beige, Pastel, Gamer Violet')
  })

  it('maps both Cmd/Ctrl F and Cmd/Ctrl K to the real note search store', () => {
    const source = appShell()

    expect(source).toContain("normalizedKey === 'f' || normalizedKey === 'k'")
    expect(source).toContain('searchStore.open()')
    expect(source).toContain('if (isSettingsOpen.value || document.body.classList.contains(\'en-excalidraw-open\')) return')
    expect(source).toContain("import '../../styles/note-editor-redesign.css'")
  })

  it('uses a transparent dedicated Excalidraw mark and translated tooltip', () => {
    const source = imageToolbar()

    expect(source).toContain("tooltip: t('excalidraw.title')")
    expect(source).toContain('encodeURIComponent')
    expect(source).toContain('stroke="#8b7cf6"')
    expect(source).not.toContain('<rect')
    expect(source).not.toContain('fill="#6C63FF"')
  })

  it('normalizes every app theme to Excalidraw light/dark and adds real save shortcuts', () => {
    const source = excalidrawDialog()

    expect(source).toContain('getThemeMode(props.theme)')
    expect(source).toContain("useI18n")
    expect(source).toContain("event.key.toLowerCase() === 's'")
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('class="en-excalidraw-mark"')
    expect(source).toContain('class="en-excalidraw-hint"')
    expect(source).toContain('exportExcalidrawSceneBlob')
  })

  it('keeps note behavior intact while centralizing visual and translated chrome', () => {
    const topBar = noteTopBar()
    const footer = noteFooter()
    const styles = noteStyles()

    expect(topBar).toContain("useI18n")
    expect(topBar).toContain("t('note.titleLabel')")
    expect(topBar).toContain("$emit('update-title'")
    expect(topBar).toContain("$emit('toggle-pin')")
    expect(footer).toContain("t('common.words')")
    expect(footer).toContain("$emit('open-graph')")
    expect(styles).toContain('.en-editor-host > .editor-with-tabs')
    expect(styles).toContain('width: min(100%, 1120px)')
    expect(styles).toContain('This layer deliberately does not modify Muya behavior')
  })
})
