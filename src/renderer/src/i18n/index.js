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
      },
      selector: {
        tab: {
          select: 'Select image',
          embedLink: 'Embed link'
        },
        select: {
          chooseButton: 'Choose image',
          tip: 'Choose an image from your device.'
        },
        inputs: {
          alt: 'Alt text',
          src: 'Image path or URL',
          title: 'Title'
        },
        embedButton: 'Embed image',
        hint: {
          prefix: 'Need alt text or title?',
          full: 'Show more fields',
          simple: 'Show fewer fields'
        }
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
    file: {
      changeEncoding: 'Change encoding',
      quickOpen: 'Quick open',
      changeLineEnding: 'Change line ending',
      trailingNewline: 'Trailing newline'
    },
    spellchecker: {
      switchLanguage: 'Switch spellchecker language'
    }
  },
  commandPalette: {
    placeholders: {
      selectLanguage: 'Select language',
      selectOption: 'Select an option',
      searchFileToOpen: 'Search a file to open'
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
const loadedLocales = new Set(['en'])
const enTranslations = englishFallback

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: enTranslations },
  modifiers: {
    '@': () => '@'
  },
  pluralRules: {},
  messageCompiler: {
    compile: (message) => {
      if (typeof message === 'string' && message.includes('|')) {
        return () => message
      }
      return null
    }
  }
})

export const t = (key, ...args) => {
  if (!i18n) {
    console.warn('⚠️ i18n unavailable, using English fallback')
    return key
  }

  try {
    if (!i18n.global) {
      console.warn('⚠️ i18n.global not ready yet, falling back to EN')
      return key
    }
    if (typeof i18n.global.te === 'function' && !i18n.global.te(key)) {
      return key
    }
    return i18n.global.t(key, ...args)
  } catch (error) {
    console.error('❌ Translation function error:', error)
    return key
  }
}

export const setLanguage = (locale) => {
  if (!locale) return
  if (locale !== 'en' && !loadedLocales.has(locale)) {
    const translation = loadLocaleMessages(locale)
    const localeMessages = mergeLocaleMessages(englishFallback, translation)
    if (!localeMessages) return

    i18n.global.setLocaleMessage(locale, localeMessages)
    loadedLocales.add(locale)
    console.log(`🌐 Loaded and set new locale: ${locale}`)
  }
  i18n.global.locale.value = locale
}

export const getCurrentLanguage = () => i18n.global.locale.value

export { i18n }
export default i18n

if (window.electron && window.electron.ipcRenderer) {
  window.electron.ipcRenderer.on('language-changed', (event, newLocale) => {
    setLanguage(newLocale)
    bus.emit('language-changed', newLocale)
  })

  window.electron.ipcRenderer.send('mt::get-current-language')
  window.electron.ipcRenderer.on('mt::current-language', (event, language) => {
    setLanguage(language)
    bus.emit('language-changed', language)
  })
}
