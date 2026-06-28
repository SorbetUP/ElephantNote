import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Tauri-only renderer runtime', () => {
  it('does not silently bootstrap a browser or Electron-compatible renderer fallback', () => {
    const main = read('src/renderer/src/main.js')

    expect(main).toContain("import { installTauriRuntimeBridge } from './platform/tauriRuntimeBridge'")
    expect(main).toContain('installTauriRuntimeBridge()')
    expect(main).toContain("const runtime = 'tauri'")
    expect(main).toContain('unsupported runtime')
    expect(main).not.toContain('tauri-compatible')
    expect(main).not.toContain('} else {\n    bootstrapRenderer()')
  })

  it('keeps the public renderer entrypoint guarded by a strict Tauri bridge wrapper', () => {
    const bridge = read('src/renderer/src/platform/tauriRuntimeBridge.js')

    expect(bridge).toContain('export const installTauriRuntimeBridge')
    expect(bridge).toContain('requires the Tauri runtime bridge')
    expect(bridge).toContain("mode !== 'tauri'")
    expect(bridge).not.toContain('tauri-compatible')
  })
})
