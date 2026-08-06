import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8')

const listJavaScriptFiles = (relativeDirectory) => {
  const directory = path.resolve(root, relativeDirectory)
  const files = []
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      else if (/\.(?:js|ts|vue)$/.test(entry.name)) files.push(fullPath)
    }
  }
  visit(directory)
  return files
}

describe('renderer API architecture guard', () => {
  it('keeps the public client free of legacy fallbacks', () => {
    const source = read('Elephant/front/app/services/elephantnoteClient.js')
    expect(source).not.toContain('legacyCalls')
    expect(source).not.toContain('LEGACY_CALLS')
    expect(source).not.toContain('atomicFeatureApi')
  })

  it('keeps domain clients independent from platform bridges', () => {
    const source = read('Elephant/front/app/services/elephantnoteClient/domainClients.js')
    for (const forbidden of [
      'window.elephantnote',
      'globalThis.window?.elephantnote',
      '__TAURI__',
      'getBridge',
      'callModelBridge',
      'requireAtomicFeatureApi'
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('forbids raw Tauri transport calls in portable Elephant frontend code', () => {
    const violations = []
    for (const filename of listJavaScriptFiles('Elephant/front/app')) {
      const source = fs.readFileSync(filename, 'utf8')
      if (source.includes('__TAURI__') || source.includes('.core.invoke(')) {
        violations.push(path.relative(root, filename))
      }
    }
    expect(violations).toEqual([])
  })

  it('isolates compatibility access in one named adapter', () => {
    const runtime = read('Elephant/front/app/services/elephantnoteClient/apiRuntime.js')
    const adapter = read('Elephant/front/app/services/elephantnoteClient/platformCompatibilityAdapter.js')
    expect(runtime).toContain("from './platformCompatibilityAdapter'")
    expect(adapter).toContain('createPlatformCompatibilityAdapter')
    expect(adapter).toContain('ELEPHANTNOTE_COMPATIBILITY_METHOD_UNAVAILABLE')
  })

  it('installs the versioned Tauri facade after bridge bootstrap', () => {
    const source = read('src/renderer/src/platform/tauriRuntimeBridge.js')
    expect(source).toContain('installTauriApiContractFacade')
    expect(source).toContain('queueMicrotask')
  })
})
