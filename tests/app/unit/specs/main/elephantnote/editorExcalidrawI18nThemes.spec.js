import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const importFromRoot = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href)

const appearance = () => read('Elephant/shared/appearance.js')
const appMessages = () => read('Elephant/frontend/app/i18n/appMessages.js')
const additionalAppLocales = () => read('Elephant/frontend/app/i18n/additionalAppLocales.js')
const i18n = () => read('Elephant/frontend/src/renderer/src/i18n/index.js')
const settings = () => read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
const appShell = () => read('Elephant/frontend/app/components/shell/AppShell.vue')
const mainContent = () => read('Elephant/frontend/app/components/shell/MainContent.vue')
const excalidrawDialog = () => read('Elephant/frontend/app/components/editor/ExcalidrawDialog.vue')
const graphHost = () => read('Elephant/frontend/app/components/views/GraphViewHost.vue')
const imageToolbar = () => read('Elephant/frontend/src/muya/lib/ui/imageToolbar/config.js')
const noteTopBar = () => read('Elephant/frontend/app/components/editor/NoteEditorTopBar.vue')
const noteFooter = () => read('Elephant/frontend/app/components/editor/NoteEditorFooter.vue')
const noteStyles = () => read('Elephant/frontend/app/styles/note-editor-redesign.css')

describe('expanded ElephantNote experience', () => {
  it('resolves beige, pastel and gamer violet as real light/dark themes', async () => {
    const module = await importFromRoot('Elephant/shared/appearance.js')

    for (const familyId of ['beige', 'pastel', 'gamer-violet']) {
      const family = module.ELEPHANTNOTE_THEME_FAMILIES.find((item) => item.id === familyId)
      expect(family).toBeTruthy()
      expect(module.getThemeVariant(familyId, 'light')).toBe(`${familyId}-light`)
      expect(module.getThemeVariant(familyId, 'dark')).toBe(`${familyId}-dark`)
      expect(module.getThemeMode(`${familyId}-light`)).toBe('light')
      expect(module.getThemeMode(`${familyId}-dark`)).toBe('dark')
      expect(module.getThemeTokens(`${familyId}-light`)['--en-primary']).toMatch(/^#/)
      expect(module.getThemeTokens(`${familyId}-dark`)['--editorBgColor']).toMatch(/^#/)
    }
  })

  it('keeps declarative theme registrations complete', () => {
    const source = appearance()

    for (const family of ['beige', 'pastel', 'gamer-violet']) {
      expect(source).toContain(`id: '${family}'`)
      expect(source).toContain(`'${family}-light': createThemeTokens`)
      expect(source).toContain(`'${family}-dark': createThemeTokens`)
    }
    expect(source).toContain("floatShadow: '0 0 34px rgba(168, 85, 247, 0.24)")
  })

  it('returns every ISO language, broad built-in translations and RTL behavior', async () => {
    const module = await importFromRoot('Elephant/frontend/app/i18n/appMessages.js')
    const options = module.getSupportedLanguageOptions('en')
    const codes = options.map((option) => option.code)
    const translatedCodes = options.filter((option) => option.hasBuiltInAppMessages).map((option) => option.code)

    expect(options.length).toBeGreaterThan(180)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toEqual(expect.arrayContaining(['system', 'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'ja', 'ko', 'zh', 'ar', 'he']))
    expect(translatedCodes).toEqual(expect.arrayContaining(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'ja', 'ko', 'zh', 'ar']))
    expect(module.getAppMessages('fr').common.settings).toBe('Paramètres')
    expect(module.getAppMessages('ja').common.settings).toBe('設定')
    expect(module.getAppMessages('ar').settings.language).toBe('اللغة')
    expect(module.getAppMessages('he').common.settings).toBe('Settings')
    expect(module.normalizeAppLocale('zh-Hant-TW')).toBe('zh-TW')
    expect(module.normalizeAppLocale('pt_BR')).toBe('pt')
    expect(module.isRtlLocale('ar-SA')).toBe(true)
    expect(module.isRtlLocale('fr-FR')).toBe(false)
  })

  it('centralizes app messages and exposes every ISO 639-1 language with fallback', () => {
    const source = appMessages()
    const expanded = additionalAppLocales()

    expect(source).toContain("import ISO6391 from 'iso-639-1'")
    expect(source).toContain("import { additionalAppLocales } from './additionalAppLocales'")
    expect(source).toContain('ISO6391.getAllCodes()')
    expect(source).toContain('new Intl.DisplayNames')
    expect(source).toContain('...additionalAppLocales')
    expect(source).toContain('mergeMessages(english, builtInMessages[normalized] || {})')
    expect(source).toContain("['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi']")
    expect(source).toContain("code: 'system'")
    expect(expanded).toContain("'zh-CN':")
    expect(expanded).toContain("'zh-TW':")
    expect(expanded).toContain('export const additionalAppLocales')
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
    expect(source).toContain("if (isSettingsOpen.value || document.body.classList.contains('en-excalidraw-open')) return")
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

  it('keeps Excalidraw synchronized with the app light or dark mode', () => {
    const source = excalidrawDialog()

    expect(source).toContain('const excalidrawTheme = computed(() => getThemeMode(props.theme))')
    expect(source).toContain('theme: excalidrawTheme.value')
    expect(source).toContain('watch(excalidrawTheme, (theme) =>')
    expect(source).toContain('api.updateScene({')
    expect(source).toContain('viewBackgroundColor: getExcalidrawBackgroundColor(theme)')
    expect(source).toContain('toggleTheme: false')
    expect(source).toContain("event.key.toLowerCase() === 's'")
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('exportExcalidrawSceneBlob')
  })

  it('keeps graph settings hidden until the user explicitly opens them', () => {
    const host = graphHost()
    const content = mainContent()

    expect(content).toContain('<graph-view-host v-else-if=')
    expect(content).toContain("import GraphViewHost from '../views/GraphViewHost.vue'")
    expect(host).toContain("root?.querySelector?.('.en-graph-settings-panel')")
    expect(host).toContain("root.querySelector?.('.en-graph-floating-icon.active')?.click()")
    expect(host).toContain('without bypassing or duplicating the component\'s state machine')
  })

  it('keeps note behavior intact while centralizing visual and translated chrome', () => {
    const topBar = noteTopBar()
    const footer = noteFooter()
    const styles = noteStyles()

    expect(topBar).toContain('useI18n')
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
