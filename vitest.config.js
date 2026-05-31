import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/unit/specs/**/*.spec.js', 'Elephant/tests/unit/**/*.spec.js'],
    globals: true,
  },
  resolve: {
    alias: {
      'elephant-back': resolve(__dirname, 'Elephant/back/app'),
      'elephant-front': resolve(__dirname, 'Elephant/front/app'),
      'elephant-shared': resolve(__dirname, 'Elephant/shared'),
      'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
      '@/elephantnote': resolve(__dirname, 'Elephant/front/app'),
      'main_renderer/elephantnote': resolve(__dirname, 'Elephant/back/app'),
      '@': resolve(__dirname, 'src/renderer/src'),
      common: resolve(__dirname, 'src/common'),
      muya: resolve(__dirname, 'src/muya'),
      main_renderer: resolve(__dirname, 'src/main'),
    },
    extensions: ['.mjs', '.js', '.json'],
  },
})
