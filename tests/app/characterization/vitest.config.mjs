import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const referenceRoot = process.env.MUYA_REFERENCE_ROOT
const candidateRoot = process.env.MUYA_CANDIDATE_ROOT || path.join(repoRoot, 'Elephant/frontend/src/muya')

if (!referenceRoot) {
  throw new Error('MUYA_REFERENCE_ROOT is required for characterization tests.')
}

export default {
  root: repoRoot,
  resolve: {
    alias: {
      'muya-rust-wasm-bundle': path.join(candidateRoot, 'lib/rust/disabledWasm.js'),
      '@muya-reference-quick-insert': path.join(referenceRoot, 'lib/ui/quickInsert/config.js'),
      '@muya-candidate-quick-insert': path.join(candidateRoot, 'lib/ui/quickInsert/config.js'),
      '@muya-reference': path.join(referenceRoot, 'lib/index.js'),
      '@muya-candidate': path.join(candidateRoot, 'lib/index.js')
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test')
  },
  test: {
    include: ['tests/app/characterization/**/*.characterization.mjs'],
    environment: 'jsdom',
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    isolate: true,
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    reporters: ['default']
  }
}
