import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('optional editor feature addons', () => {
  it('moves code execution startup out of renderer core', () => {
    const main = read('Elephant/frontend/src/renderer/src/main.js')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/codeExecution.js')
    const runtime = read('Elephant/frontend/src/renderer/src/platform/executableCodeBlocks.js')

    expect(main).not.toContain('installExecutableCodeBlocks')
    expect(addon).toContain("const ADDON_ID = 'elephant.code-execution'")
    expect(addon).toContain('defaultEnabled: false')
    expect(addon).toContain('removable: true')
    expect(addon).toContain('installExecutableCodeBlocks(globalThis)')
    expect(addon).toContain('runtime?.dispose?.()')
    expect(runtime).toContain('settings.dispose()')
  })

  it('moves Excalidraw observers and cleanup out of renderer core', () => {
    const main = read('Elephant/frontend/src/renderer/src/main.js')
    const addon = read('Elephant/frontend/src/renderer/src/addons/builtin/excalidraw.js')
    const markdown = read('Elephant/frontend/src/renderer/src/platform/excalidrawMarkdownCleanup.js')
    const images = read('Elephant/frontend/src/renderer/src/platform/excalidrawImageRuntimeFixes.js')

    expect(main).not.toContain('installExcalidrawMarkdownCleanup')
    expect(main).not.toContain('installExcalidrawImageRuntimeFixes')
    expect(addon).toContain("const ADDON_ID = 'elephant.excalidraw'")
    expect(addon).toContain('defaultEnabled: false')
    expect(addon).toContain('installExcalidrawMarkdownCleanup()')
    expect(addon).toContain('installExcalidrawImageRuntimeFixes(globalThis)')
    expect(markdown).toContain('unsubscribe?.()')
    expect(markdown).toContain("bus.off?.('invalidate-image-cache'")
    expect(images).toContain('observer.disconnect()')
    expect(images).toContain("document.removeEventListener('load'")
    expect(images).toContain('removeInstalledUi()')
  })

  it('includes both addons in the refreshed Develop parity pack', () => {
    const packs = read('Elephant/frontend/src/renderer/src/addons/builtin/addonProfiles.js')

    expect(packs).toContain("id: 'elephant.code-execution'")
    expect(packs).toContain("id: 'elephant.excalidraw'")
    expect(packs).toContain('isDevelopParityCurrent')
    expect(packs).toContain('Missing, invalid or stale protected packs are regenerated below.')
  })
})
