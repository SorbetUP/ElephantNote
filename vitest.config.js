import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import vue from '@vitejs/plugin-vue'
import packageJson from './package.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiContractsRuntime = resolve(__dirname, 'Elephant/shared/apiContractsRuntime.js')
const npmPackageAliases = Object.fromEntries(
  Object.keys({
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  })
    .filter((name) => !['vite', 'prismjs'].includes(name))
    .map((name) => [name, resolve(__dirname, 'Elephant/node_modules', name)])
)

const legacyElephantTestImports = () => ({
  name: 'elephantnote-legacy-test-imports',
  enforce: 'pre',
  resolveId(source, importer) {
    const normalizedImporter = String(importer || '').replace(/\\/g, '/')
    if (!normalizedImporter.includes('/tests/elephant/unit/')) return null

    const mappings = [
      ['../../../../Elephant/', 'Elephant/'],
      ['../../front/app/', 'Elephant/frontend/app/'],
      ['../../front/', 'Elephant/frontend/'],
      ['../../back/app/', 'Elephant/backend/js/'],
      ['../../back/', 'Elephant/backend/'],
      ['../../shared/', 'Elephant/shared/']
    ]

    const mapping = mappings.find(([prefix]) => source.startsWith(prefix))
    if (!mapping) return null
    const [prefix, replacement] = mapping
    return resolve(__dirname, replacement, source.slice(prefix.length))
  }
})

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/app/unit/setup/webgl.js'],
    include: ['tests/app/unit/**/*.spec.js', 'tests/elephant/unit/**/*.spec.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'build/coverage',
      include: [
        'Elephant/backend/js/sync/RcloneManager.js',
        'Elephant/backend/js/sync/rcloneArgs.js',
        'Elephant/backend/js/sync/rcloneVaultEngine.js'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  },
  plugins: [legacyElephantTestImports(), vue()],
  resolve: {
    alias: {
      ...npmPackageAliases,
      electron: resolve(__dirname, 'tests/app/unit/stubs/electron.js'),
      'electron-store': resolve(__dirname, 'tests/app/unit/stubs/electronStore.js'),
      'electron-log/renderer': resolve(__dirname, 'tests/app/unit/stubs/electronLog.js'),
      'electron-log': resolve(__dirname, 'tests/app/unit/stubs/electronLog.js'),
      'elephant-front': resolve(__dirname, 'Elephant/frontend/app'),
      'elephant-shared': resolve(__dirname, 'Elephant/shared'),
      'common/elephantnote/apiContracts': apiContractsRuntime,
      'common/elephantnote': resolve(__dirname, 'Elephant/shared'),
      '@/elephantnote': resolve(__dirname, 'Elephant/frontend/app'),
      'main_renderer/elephantnote': resolve(__dirname, 'Elephant/backend/js'),
      '@': resolve(__dirname, 'Elephant/frontend/src/renderer/src'),
      common: resolve(__dirname, 'Elephant/frontend/src/common'),
      muya: resolve(__dirname, 'Elephant/frontend/src/muya')
    },
    extensions: ['.mjs', '.js', '.json', '.vue']
  }
})
