import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const processNativeSlugs = ['ai-ocr', 'code-execution']

const manifestFor = (slug) => JSON.parse(
  fs.readFileSync(path.join(root, 'addons/official', slug, 'manifest.json'), 'utf8')
)

describe('native addon mobile compatibility', () => {
  it('never advertises downloaded process sidecars as Android or iOS executables', () => {
    for (const slug of processNativeSlugs) {
      const manifest = manifestFor(slug)
      expect(manifest.native.runner).toBe('process')
      expect(Object.keys(manifest.native.sidecars).some((key) => /^(android|ios)-/.test(key))).toBe(false)
      expect(manifest.native.mobile.android.supported).toBe(false)
      expect(manifest.native.mobile.android.reason).toMatch(/host adapter/i)
      expect(manifest.native.mobile.ios.supported).toBe(false)
      expect(manifest.native.mobile.ios.reason).toMatch(/host adapter/i)
    }
  })

  it('keeps Sites renderer-owned and installable on desktop, Android and iOS', () => {
    const manifest = manifestFor('sites')
    const source = fs.readFileSync(path.join(root, 'addons/official/sites/main.js'), 'utf8')
    expect(manifest.version).toBe('1.3.0')
    expect(manifest.permissions.native).toBeUndefined()
    expect(manifest.native).toBeUndefined()
    expect(source).toContain('tauri_addons_assets_allow_directory')
    expect(source).toContain('convertFileSrc')
    expect(source).not.toContain('api.native.call')
    expect(fs.existsSync(path.join(root, 'addons/official/sites/addon.build.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'addons/official/sites/native'))).toBe(false)
  })
})
