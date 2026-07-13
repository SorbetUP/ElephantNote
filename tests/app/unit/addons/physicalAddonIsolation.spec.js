import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))

describe('physical addon isolation', () => {
  it('keeps AI parent and OCR code out of Elephant core', () => {
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const builtinIndex = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')

    expect(core).not.toContain('pub mod ocr;')
    expect(core).not.toContain('tauri_ocr_status')
    expect(core).not.toContain('tauri_ocr_image')
    expect(builtinIndex).not.toContain("import('./ai')")
    expect(builtinIndex).not.toContain("id: 'elephant.ai'")
    expect(builtinIndex).not.toContain("import('./aiOcr')")
    expect(builtinIndex).not.toContain("id: 'elephant.ai-ocr'")
    expect(exists('Elephant/backend/tauri/src/ocr.rs')).toBe(false)
    expect(exists('Elephant/frontend/src/renderer/src/addons/builtin/ai.js')).toBe(false)
    expect(exists('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiProvidersSettings.vue')).toBe(false)
    expect(exists('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiAddonSettings.vue')).toBe(false)
    expect(exists('Elephant/frontend/src/renderer/src/addons/builtin/aiOcr.js')).toBe(false)
    expect(exists('Elephant/frontend/src/renderer/src/addons/builtin/ui/AiOcrSettings.vue')).toBe(false)
  })

  it('keeps AI parent and OCR implementations inside separately packageable addons', () => {
    const aiManifest = JSON.parse(read('addons/official/ai/manifest.json'))
    const aiEntry = read('addons/official/ai/main.js')
    const ocrManifest = JSON.parse(read('addons/official/ai-ocr/manifest.json'))
    const ocrEntry = read('addons/official/ai-ocr/main.js')
    const sidecar = read('addons/official/ai-ocr/native/src/main.rs')

    expect(aiManifest.id).toBe('elephant.ai')
    expect(aiManifest.contributes.runtimeMode).toBe('trusted')
    expect(aiEntry).toContain("standalone: true")
    expect(aiEntry).toContain("slot: 'ai.ocr'")
    expect(ocrManifest.id).toBe('elephant.ai-ocr')
    expect(ocrManifest.permissions.native).toBe(true)
    expect(ocrManifest.requires).toEqual({ 'elephant.ai': '>=2.0.0' })
    expect(Object.keys(ocrManifest.native.sidecars)).toContain('macos-aarch64')
    expect(ocrEntry).toContain("slot: 'ai.ocr'")
    expect(ocrEntry).toContain('this.api.native.call')
    expect(ocrEntry).toContain('this.api.storage.get')
    expect(ocrEntry).not.toContain('api.experimental')
    expect(sidecar).toContain('elephant-addon-sidecar-v1')
    expect(sidecar).toContain('"ocr.image"')
  })

  it('uses only the generic native host from the application binary', () => {
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const host = read('Elephant/backend/tauri/src/addon_sidecars.rs')
    const trustedRuntime = read('Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js')

    expect(core).toContain('addon_sidecars::tauri_addons_sidecar_status')
    expect(core).toContain('addon_sidecars::tauri_addons_sidecar_call')
    expect(host).not.toContain('tesseract')
    expect(host).not.toContain('OCR')
    expect(host).toContain('Addon native permission was not granted')
    expect(host).toContain('Addon sidecar escapes its package directory')
    expect(trustedRuntime).toContain("native: Object.freeze({")
    expect(trustedRuntime).toContain("storage: Object.freeze({")
  })

  it('enforces parent addon requirements at native and renderer manager boundaries', () => {
    const core = read('Elephant/backend/tauri/src/lib_min.rs')
    const dependencies = read('Elephant/backend/tauri/src/addon_dependencies.rs')
    const manager = read('Elephant/frontend/src/renderer/src/addons/AddonManager.js')
    const registryView = read('Elephant/backend/tauri/src/addon_registry_view.rs')

    expect(core).toContain('addon_dependencies::tauri_addons_set_enabled')
    expect(core).toContain('addon_dependencies::tauri_addons_uninstall')
    expect(core).toContain('addon_registry_view::tauri_addons_list')
    expect(dependencies).toContain('validate_requirements')
    expect(dependencies).toContain('VersionReq::parse')
    expect(dependencies).toContain('Cannot disable')
    expect(dependencies).toContain('Cannot uninstall')
    expect(manager).toContain('assertDependenciesEnabled')
    expect(manager).toContain('getDependents')
    expect(registryView).toContain('physical_manifest')
  })

  it('supports catalog downloads of complete hashed enaddon archives', () => {
    const catalog = read('Elephant/backend/tauri/src/addon_catalog.rs')
    const buildScript = read('build/scripts/build-physical-addon.mjs')
    const packager = read('build/tools/enaddon-packager/src/main.rs')

    expect(catalog).toContain('package_path')
    expect(catalog).toContain('package_hash')
    expect(catalog).toContain('download_prebuilt_package')
    expect(catalog).toContain('blake3::hash')
    expect(buildScript).toContain('build/out/addons/releases')
    expect(packager).toContain('blake3::hash')
  })
})
