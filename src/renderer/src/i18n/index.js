import { createI18n } from 'vue-i18n'
import bus from '../bus'

const createFallbackEnglishTranslations = () => ({
  quickInsert: {
    basicBlock: 'Basic blocks',
    paragraph: {
      title: 'Paragraph',
      subtitle: 'Plain text paragraph'
    },
    horizontalLine: {
      title: 'Horizontal line',
      subtitle: 'Add a visual divider'
    },
    frontMatter: {
      title: 'Front matter',
      subtitle: 'YAML metadata block'
    },
    header: 'Headings',
    header1: {
      title: 'Heading 1',
      subtitle: '# Heading'
    },
    header2: {
      title: 'Heading 2',
      subtitle: '## Heading'
    },
    header3: {
      title: 'Heading 3',
      subtitle: '### Heading'
    },
    header4: {
      title: 'Heading 4',
      subtitle: '#### Heading'
    },
    header5: {
      title: 'Heading 5',
      subtitle: '##### Heading'
    },
    header6: {
      title: 'Heading 6',
      subtitle: '###### Heading'
    },
    advancedBlock: 'Advanced blocks',
    tableBlock: {
      title: 'Table',
      subtitle: 'Insert a markdown table'
    },
    mathFormula: {
      title: 'Math formula',
      subtitle: 'Insert a LaTeX math block'
    },
    htmlBlock: {
      title: 'HTML block',
      subtitle: 'Insert raw HTML'
    },
    codeBlock: {
      title: 'Code block',
      subtitle: 'Insert fenced code'
    },
    quoteBlock: {
      title: 'Quote block',
      subtitle: 'Insert a block quote'
    },
    listBlock: 'Lists',
    orderedList: {
      title: 'Numbered list',
      subtitle: 'Create an ordered list'
    },
    bulletList: {
      title: 'Bullet list',
      subtitle: 'Create an unordered list'
    },
    todoList: {
      title: 'Task list',
      subtitle: 'Create a checklist'
    },
    diagram: 'Diagrams',
    vegaChart: {
      title: 'Vega-Lite chart',
      subtitle: 'Insert a Vega-Lite chart block'
    },
    flowChart: {
      title: 'Flowchart',
      subtitle: 'Insert a flowchart block'
    },
    sequenceChart: {
      title: 'Sequence diagram',
      subtitle: 'Insert a sequence diagram block'
    },
    plantUMLChart: {
      title: 'PlantUML diagram',
      subtitle: 'Insert a PlantUML block'
    },
    mermaid: {
      title: 'Mermaid diagram',
      subtitle: 'Insert a Mermaid block'
    }
  },
  editor: {
    image: {
      toolbar: {
        edit: 'Edit image',
        inline: 'Inline image',
        alignLeft: 'Align left',
        alignCenter: 'Align center',
        alignRight: 'Align right',
        delete: 'Delete image'
      }
    },
    'highlight-start': 'Highlight start',
    'highlight-end': 'Highlight end',
    'input-footnote-definition': 'Input footnote definition',
    'input-yaml-front-matter': 'Input YAML front matter',
    'input-language-identifier': 'Input language identifier',
    'input-mathematical-formula': 'Input mathematical formula',
    fence: 'Code fence',
    indent: 'Indent',
    'front-matter-delimiter': 'Front matter delimiter',
    'math-delimiter': 'Math delimiter',
    'mermaid-start': 'Mermaid start',
    'flowchart-start': 'Flowchart start',
    'sequence-start': 'Sequence start',
    'plantuml-start': 'PlantUML start',
    'vega-lite-start': 'Vega-Lite start',
    'click-to-add-image': 'Click to add image',
    'load-image-failed': 'Failed to load image'
  },
  frontMenu: {
    duplicate: 'Duplicate',
    turnInto: 'Turn into',
    newParagraph: 'New paragraph',
    delete: 'Delete'
  },
  edit: {
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select all'
  },
  commands: {
    spellchecker: {
      switchLanguage: 'Switch spellchecker language'
    }
  },
  commandPalette: {
    placeholders: {
      selectLanguage: 'Select language'
    }
  },
  search: {
    searchPlaceholder: 'Search notes...',
    caseSensitive: 'Case sensitive',
    wholeWord: 'Whole word',
    useRegex: 'Use regular expression'
  }
})

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'

const mergeLocaleMessages = (fallback = {}, override = {}) => {
  const output = { ...fallback }
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeLocaleMessages(output[key], value)
    } else {
      output[key] = value
    }
  }
  return output
}

const loadLocaleMessages = (locale) => {
  try {
    return globalThis.window?.i18nUtils?.loadTranslations?.(locale) || {}
  } catch (error) {
    console.warn(`⚠️ Failed to load ${locale} translations, using fallback messages`, error)
    return {}
  }
}

const englishFallback = createFallbackEnglishTranslations()
const enTranslations = mergeLocaleMessages(englishFallback, loadLocaleMessages('en'))

// Create the Vue i18n instance
defaultLocaleFallback: {
}
const i18n = createI18n({
  legacy: false,
  locale: 'en', // default is en
  fallbackLocale: 'en',
  messages: { en: enTranslations }, // Load en by default only
  // Disable linking to avoid '@' symbols being misinterpreted
  modifiers: {
    '@': () => '@'
  },
  // Disable plural parsing
  pluralRules: {},
  // Custom message compiler to handle '|' characters
  messageCompiler: {
    compile: (message) => {
      // If the message contains '|', return the raw string without plural parsing
      if (typeof message === 'string' && message.includes('|')) {
        return () => message
      }
      // For other messages, use the default compiler
      return null
    }
  }
})

// Export the translation function - Fix: correctly handle the Vue i18n v9+ global getter
export const t = (key, ...args) => {
  // Check if the i18n instance is available
  if (!i18n) {
    console.warn('⚠️ i18n实例不可用，使用英文fallback')
    return key
  }

  try {
    // Correctly access the global property
    if (!i18n.global) {
      console.warn('⚠️ i18n.global not ready yet, falling back to EN')
      return key
    }

    return i18n.global.t(key, ...args)
  } catch (error) {
    console.error('❌ 翻译函数执行错误:', error)
    return key
  }
}

// Export language setter function
export const setLanguage = (locale) => {
  if (!locale) return
  if (!i18n.global.availableLocales.includes(locale)) {
    const translation = loadLocaleMessages(locale)
    const localeMessages = locale === 'en'
      ? mergeLocaleMessages(englishFallback, translation)
      : translation
    if (!localeMessages) return // Failed to load locale file, error msg should be in the loadTranslations function

    // Add the loaded locale to i18n instance
    i18n.global.setLocaleMessage(locale, localeMessages)
    console.log(`🌐 Loaded and set new locale: ${locale}`)
  }
  i18n.global.locale.value = locale
}

// Export the current language getter function
export const getCurrentLanguage = () => i18n.global.locale.value

// Export the i18n instance (named and default export)
export { i18n }
export default i18n

// Listen for language changes
if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('language-changed', (event, newLocale) => {
    setLanguage(newLocale)
    bus.emit('language-changed', newLocale)
  })

  // Request the current language setting at startup
  window.electron.ipcRenderer.send('mt::get-current-language')
  window.electron.ipcRenderer.on('mt::current-language', (event, language) => {
    setLanguage(language)
    bus.emit('language-changed', language)
  })
}
