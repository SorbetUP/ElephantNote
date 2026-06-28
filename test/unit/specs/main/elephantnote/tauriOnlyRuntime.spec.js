import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Tauri-only renderer runtime', () => {
  it('does not silently bootstrap a browser or Electron-compatible renderer fallback', () => {
    const main = read('src/renderer/src/main.js')

    expect(main).toContain("const runtime = 'tauri'")
    expect(main).toContain('unsupported runtime')
    expect(main).not.toContain('tauri-compatible')
    expect(main).not.toContain('} else {\n    bootstrapRenderer()')
  })
})
