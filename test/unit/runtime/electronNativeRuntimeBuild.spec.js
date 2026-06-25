import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Electron native runtime build contract', () => {
  it('loads node llama cpp at runtime instead of statically bundling it', () => {
    const runtime = readText('Elephant/back/app/runtime/nodeLlamaCppRuntime.js')

    expect(runtime).toContain('@vite-ignore')
    expect(runtime).toContain("['node','llama','cpp'].join('-')")
    expect(runtime).not.toContain("import('node-llama-cpp')")
  })

  it('keeps native runtimes external in the Electron build config', () => {
    const config = readText('electron.vite.config.js')

    expect(config).toContain("'native-keymap'")
    expect(config).toContain("'node-llama-cpp'")
    expect(config).toContain('ssr')
    expect(config).toContain('optimizeDeps')
  })
})
