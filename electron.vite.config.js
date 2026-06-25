import { resolve, dirname } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import renderer from 'vite-plugin-electron-renderer'
import svgLoader from 'vite-svg-loader'
import postcssPresetEnv from 'postcss-preset-env'
import packageJson from './package.json' with { type: 'json' }
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const electronLogShim = resolve(__dirname, 'src/renderer/src/platform/electronLogShim.js')
const isNativeRuntimeExternal = (id = '', importer = '') => {
  const target = `${id} ${importer || ''}`
  return target.includes('native-keymap') ||
    target.includes('keymapping') ||
    target.includes('node-llama-cpp')
}
const nativeRuntimeExternalPlugin = {
  name: 'native-runtime-external',
  resolveId(source = '', importer = '') {
    if (!isNativeRuntimeExternal(source, importer)) return null
    return { id: source, external: true }
  }
}
const nativeRuntimeRollupOptions = {
  external: isNativeRuntimeExternal,
  plugins: [nativeRuntimeExternalPlugin]
}

export default defineConfig({
  main: {
    // --> Bundled as CommonJS
    // externalizeDepsPlugin() basically externises all the dependencies from being bundled during build - treating them as runtime dependencies
    // electron-vite still builds the main and preload processes into commonJS
    // hence, we need to "exclude" (in order to NOT externalise) ESonly modules so that they can be converted to CommonJS and can be required() afterwards correctly
    build: {
      externalizeDeps: {
        exclude: ['electron-store'],
        include: ['native-keymap', 'node-llama-cpp']
      },
      rollupOptions: nativeRuntimeRollupOptions
    },
    define: {
      MARKTEXT_VERSION: JSON.stringify(packageJson.version),
      MARKTEXT_VERSION_STRING: JSON.stringify(`v${packageJson.version}`)
    },
    resolve: {
      alias: {
        'electron-log/renderer': electronLogShim,
        'electron-log': electronLogShim,
        'elephant-back': resolve(__dirname, 'Elephant/back/app'),
        'elephant-front': resolve(__dirname, 'Elephant/front/app'),
        'elephant-shared': resolve(__dirname, 'Elephant/shared'),
        'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
        '@/elephantnote': resolve(__dirname, 'Elephant/front/app'),
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya')
      },
      extensions: ['.mjs', '.js', '.json']
    }
  },
  preload: {
    // --> Bundled as CommonJS
    build: {
      rollupOptions: nativeRuntimeRollupOptions
    },
    resolve: {
      alias: {
        'electron-log/renderer': electronLogShim,
        'electron-log': electronLogShim,
        'elephant-back': resolve(__dirname, 'Elephant/back/app'),
        'elephant-front': resolve(__dirname, 'Elephant/front/app'),
        'elephant-shared': resolve(__dirname, 'Elephant/shared'),
        'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
        '@/elephantnote': resolve(__dirname, 'Elephant/front/app'),
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya')
      },
      extensions: ['.mjs', '.js', '.json']
    }
  },
  renderer: {
    // --> Bundled as ES Modules
    assetsInclude: ['**/*.md'],
    define: {
      'process.env.IS_PREACT': JSON.stringify('false'),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    },
    resolve: {
      alias: {
        'electron-log/renderer': electronLogShim,
        'electron-log': electronLogShim,
        'elephant-back': resolve(__dirname, 'Elephant/back/app'),
        'elephant-front': resolve(__dirname, 'Elephant/front/app'),
        'elephant-shared': resolve(__dirname, 'Elephant/shared'),
        'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
        '@/elephantnote': resolve(__dirname, 'Elephant/front/app'),
        '@': resolve(__dirname, 'src/renderer/src'),
        common: resolve(__dirname, 'src/common'),
        muya: resolve(__dirname, 'src/muya')
      },
      extensions: ['.mjs', '.js', '.json', '.vue']
    },
    plugins: [vue(), svgLoader(), renderer()],
    css: {
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 0,
            features: { 'nesting-rules': true }
          })
        ]
      }
    }
  }
})
