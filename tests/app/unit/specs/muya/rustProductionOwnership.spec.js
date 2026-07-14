import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Rust editor production ownership', () => {
  it('uses the Rust runtime at the real editor-with-tabs boundary', () => {
    const tabs = read('Elephant/frontend/src/renderer/src/components/editorWithTabs/index.vue')
    const runtime = read('Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditor.vue')
    expect(tabs).toContain("import RuntimeEditor from './runtimeEditor.vue'")
    expect(tabs).not.toContain("import Editor from './editor.vue'")
    expect(runtime).toContain("import { RustMuyaRuntimeEditor } from '@/muya'")
    expect(runtime).not.toContain("import Editor from './editor.vue'")
    expect(runtime).not.toContain('<editor')
  })

  it('bundles the real WASM engine in standard builds without a disabled fallback', () => {
    const vite = read('vite.tauri.config.mjs')
    const packageJson = JSON.parse(read('package.json'))
    expect(vite).toContain("'muya-rust-wasm-bundle': muyaWasmGenerated")
    expect(vite).not.toContain('muyaWasmDisabled')
    expect(packageJson.scripts['tauri:web:build']).toContain('pnpm muya:wasm:build')
    expect(packageJson.scripts['tauri:web:dev']).toContain('pnpm muya:wasm:build')
  })
})
