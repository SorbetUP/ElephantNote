import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const nativeSlugs = ['ai-ocr', 'code-execution', 'sites']

const manifestFor = (slug) => JSON.parse(
  fs.readFileSync(path.join(root, 'addons/official', slug, 'manifest.json'), 'utf8')
)

describe('native addon mobile compatibility', () => {
  it('never advertises downloaded process sidecars as Android or iOS executables', () => {
    for (const slug of nativeSlugs) {
      const manifest = manifestFor(slug)
      expect(manifest.native.runner).toBe('process')
      expect(Object.keys(manifest.native.sidecars).some((key) => /^(android|ios)-/.test(key))).toBe(false)
      expect(manifest.native.mobile.android.supported).toBe(false)
      expect(manifest.native.mobile.android.reason).toMatch(/host adapter/i)
      expect(manifest.native.mobile.ios.supported).toBe(false)
      expect(manifest.native.mobile.ios.reason).toMatch(/host adapter/i)
    }
  })

  it('keeps renderer-only addons platform-neutral', () => {
    for (const slug of fs.readdirSync(path.join(root, 'addons/official'))) {
      const manifest = manifestFor(slug)
      if (manifest.permissions?.native === true) continue
      expect(manifest.native).toBeUndefined()
    }
  })
})
