import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import vue from '@vitejs/plugin-vue'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiContractsRuntime = resolve(__dirname, 'Elephant/shared/apiContractsRuntime.js')

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/unit/setup/webgl.js'],
    include: ['test/unit/**/*.spec.js', 'Elephant/tests/unit/**/*.spec.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: [
        'Elephant/back/app/sync/RcloneManager.js',
        'Elephant/back/app/sync/rcloneArgs.js',
        'Elephant/back/app/sync/rcloneVaultEngine.js'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  },
  plugins: [vue()],
  resolve: {
    alias: {
      'electron-log/renderer': resolve(__dirname, 'test/unit/stubs/electronLog.js'),
      'electron-log': resolve(__dirname, 'test/unit/stubs/electronLog.js'),
      'elephant-front': resolve(__dirname, 'Elephant/front/app'),
      'elephant-shared': resolve(__dirname, 'Elephant/shared'),
      'common/elephantnote/apiContracts': apiContractsRuntime,
      'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
      '@/elephantnote': resolve(__dirname, 'Elephant/front/app'),
      'main_renderer/elephantnote': resolve(__dirname, 'Elephant/back/app'),
      '@': resolve(__dirname, 'src/renderer/src'),
      common: resolve(__dirname, 'src/common'),
      muya: resolve(__dirname, 'src/muya')
    },
    extensions: ['.mjs', '.js', '.json', '.vue']
  }
})
