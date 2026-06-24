import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Electron window security defaults', () => {
  it('keeps renderer Node.js disabled and browser security enabled', () => {
    const config = read('src/main/config.js')

    expect(config).toContain('const secureWebPreferences = Object.freeze({')
    expect(config).toContain('contextIsolation: true')
    expect(config).toContain('nodeIntegration: false')
    expect(config).toContain('webSecurity: true')
    expect(config).not.toContain('contextIsolation: false')
    expect(config).not.toContain('nodeIntegration: true')
    expect(config).not.toContain('webSecurity: false')
  })

  it('keeps editor and preferences windows on the shared secure preference object', () => {
    const config = read('src/main/config.js')

    expect(config).toContain('webPreferences: { ...secureWebPreferences }')
    expect(config.match(/webPreferences: \{ \.\.\.secureWebPreferences \}/g)).toHaveLength(2)
  })

  it('keeps required preload globals exposed through contextBridge', () => {
    const preload = read('src/preload/index.js')

    expect(preload).toContain('if (process.contextIsolated)')
    for (const globalName of ['electron', 'rgPath', 'fileUtils', 'path', 'commandExists', 'i18nUtils', 'elephantnote']) {
      expect(preload).toContain(`contextBridge.exposeInMainWorld('${globalName}'`)
    }
  })
})
