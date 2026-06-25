import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import postcssPresetEnv from 'postcss-preset-env'
import packageJson from './package.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    assetsInclude: ['**/*.md']
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    __MARKTEXT_VERSION_STRING__: JSON.stringify(`v${packageJson.version}`)
  },
  resolve: {
    alias: {
      path: resolve(__dirname, 'src/renderer/src/platform/nodePathShim.js'),
      'node:path': resolve(__dirname, 'src/renderer/src/platform/nodePathShim.js'),
      '@electron/remote': resolve(__dirname, 'src/renderer/src/platform/electronRemoteShim.js'),
      'electron-log/renderer': resolve(__dirname, 'src/renderer/src/platform/electronLogShim.js'),
      'electron-log': resolve(__dirname, 'src/renderer/src/platform/electronLogShim.js'),
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
  plugins: [vue(), svgLoader()],
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
})
