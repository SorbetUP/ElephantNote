import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Android release recovery', () => {
  it('uses Android-only aliases instead of unresolved Vite Node stubs', () => {
    const vite = read('vite.tauri.config.mjs')
    const shim = read(
      'Elephant/frontend/src/renderer/src/platform/mobileNodeBuiltinsShim.js'
    )
    const build = read('build/scripts/build_dev_apk.sh')

    expect(vite).toContain("process.env.ELEPHANTNOTE_ANDROID_BUILD === '1'")
    for (const builtin of ['child_process', 'fs/promises', 'crypto', 'zlib']) {
      expect(vite).toContain(`'${builtin}'`)
    }
    expect(vite).toContain('__ELEPHANTNOTE_ANDROID_BUILD__')
    expect(shim).toContain('Use the Tauri bridge instead')
    expect(shim).toContain('export const spawn')
    expect(shim).toContain('export const statSync')
    expect(shim).toContain('export const createHash')
    expect(build).toContain("'__vite-browser-external'")
    expect(build).toContain('renderer contains no unresolved Vite Node builtin stubs')
  })

  it('builds one signed ARM64 release APK with deterministic Android resources', () => {
    const build = read('build/scripts/build_dev_apk.sh')
    const activity = read('build/android/MainActivity.kt')
    const workflow = read('.github/workflows/android-apk.yml')

    expect(build).toContain('ANDROID_TARGET="${ANDROID_TARGET:-aarch64}"')
    expect(build).toContain('ANDROID_BUILD_PROFILE="${ANDROID_BUILD_PROFILE:-release}"')
    expect(build).toContain('ELEPHANTNOTE_ANDROID_BUILD=1')
    expect(build).toContain('ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1')
    expect(build).toContain('android:icon')
    expect(build).toContain('useLegacyPackaging = true')
    expect(build).toContain('verify_single_target_abi')
    expect(build).toContain('apksigner')
    expect(build).toContain('verify --verbose')
    expect(activity).not.toContain('requestPermissions(')
    expect(activity).toContain('decorView.post')
    expect(activity).toContain('WindowInsets.Type.systemBars()')
    expect(workflow).toContain('pnpm tauri:android:build')
    expect(workflow).toContain('Elephant-develop_next-arm64-release-review.apk')
  })
})
