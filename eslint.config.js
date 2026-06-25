import eslintJs from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginHtml from 'eslint-plugin-html'
import pluginI18nJson from 'eslint-plugin-i18n-json'
import pluginJsonc from 'eslint-plugin-jsonc'
import neostandard from 'neostandard'
import babelParser from '@babel/eslint-parser'
import globals from 'globals'
const { configs: js } = eslintJs

const legacyStyleCompatibilityRules = Object.freeze({
  '@stylistic/arrow-spacing': 'off',
  '@stylistic/block-spacing': 'off',
  '@stylistic/brace-style': 'off',
  '@stylistic/comma-spacing': 'off',
  '@stylistic/eol-last': 'off',
  '@stylistic/indent': 'off',
  '@stylistic/key-spacing': 'off',
  '@stylistic/keyword-spacing': 'off',
  '@stylistic/multiline-ternary': 'off',
  '@stylistic/no-multiple-empty-lines': 'off',
  '@stylistic/object-curly-spacing': 'off',
  '@stylistic/quotes': 'off',
  '@stylistic/semi-spacing': 'off',
  '@stylistic/space-before-blocks': 'off',
  '@stylistic/space-before-function-paren': 'off',
  '@stylistic/space-infix-ops': 'off',
  curly: 'off',
  'no-new': 'off',
  'no-return-await': 'off',
  'no-template-curly-in-string': 'off',
  'no-undef': 'off',
  'no-unneeded-ternary': 'off',
  'no-useless-constructor': 'off',
  'no-void': 'off',
  'one-var': 'off',
  'promise/param-names': 'off'
})

export default [
  // 0. Global ignores (must be first)
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.build/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/*.min.json',
      'out/**',
      'blinko-offline/**',
      'src/muya/lib/assets/libs/**',
      'src/muya/lib/parser/marked/urlify.js',
      'src/renderer/src/assets/symbolIcon/index.js'
    ]
  },

  // 1. ESLint core recommended rules

  js.recommended,
  // 1. Use neostandard instead
  ...neostandard(),

  ...pluginVue.configs['flat/recommended'],

  // 3. Custom overrides for JS files
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    plugins: {
      html: pluginHtml
    },
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        MARKTEXT_VERSION_STRING: 'readonly',
        MARKTEXT_VERSION: 'readonly',
        __static: 'readonly'
      }
    },
    rules: {
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/arrow-parens': 'off',
      '@stylistic/no-mixed-operators': 'off',
      'no-return-assign': 'error',
      'no-console': 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'require-atomic-updates': 'off',
      'prefer-const': 'off',
      'no-prototype-builtins': 'off',
      ...legacyStyleCompatibilityRules
    },
    ignores: ['node_modules', 'src/muya/dist/**/*', 'src/muya/webpack.config.js']
  },

  // 3b. Vue files: add browser globals and relax conventions
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      ...legacyStyleCompatibilityRules
    }
  },

  // 3c. Test file globals
  {
    files: ['test/**/*.js', 'Elephant/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.vitest }
    },
    rules: {
      'no-confusing-arrow': 'off',
      ...legacyStyleCompatibilityRules
    }
  },

  // 3d. Relax behavioral rules for legacy muya editor engine
  {
    files: ['src/muya/lib/**/*.js'],
    rules: {
      'no-sequences': 'off',
      'no-unused-expressions': 'off',
      'no-return-assign': 'off',
      eqeqeq: 'warn',
      'no-var': 'warn',
      ...legacyStyleCompatibilityRules
    }
  },

  // 4. JSON files basic validation
  ...pluginJsonc.configs['flat/recommended-with-json'],

  // 5. i18n JSON files validation
  {
    files: ['src/shared/i18n/locales/*.json'],
    plugins: {
      'i18n-json': pluginI18nJson
    },
    rules: {
      'i18n-json/valid-json': 'error',
      'i18n-json/sorted-keys': 'warn',
      'i18n-json/identical-keys': [
        'error',
        {
          filePath: 'src/shared/i18n/locales/en.json'
        }
      ]
    }
  }
]
