import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Android follow-up regressions', () => {
  it('decodes textual vault files but preserves binary payloads', () => {
    const source = read('Elephant/frontend/src/renderer/src/platform/tauriFileUtilsPathGuards.js')
    expect(source).toContain('TEXT_FILE_RE')
    expect(source).toContain("formatReadResult(base64ToBytes(result.dataBase64), options, resolved)")
    expect(source).toContain('new TextDecoder')
  })

  it('creates empty notes and presents a title placeholder', () => {
    const entries = read('Elephant/backend/tauri/src/vault/entries.rs')
    const topbar = read('Elephant/frontend/app/components/editor/NoteEditorTopBar.vue')
    expect(entries).toContain('fs::write(&path, "")')
    expect(entries).not.toContain('format!("# {}\n", note_title)')
    expect(topbar).toContain('placeholder="Titre"')
  })

  it('uses the native Android Sharesheet instead of clipboard masquerading as share', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')
    const native = read('Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt')
    expect(runtime).toContain("invoke('tauri_android_share_text'")
    expect(runtime).not.toContain("navigator.clipboard?.writeText?.(`${title}")
    expect(native).toContain('Intent.ACTION_SEND')
    expect(native).toContain('Intent.createChooser')
  })

  it('lets Android back close camera and release every media track', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')
    const navigation = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    expect(runtime).toContain("addEventListener('elephantnote:android-back'")
    expect(runtime).toContain('track.stop()')
    expect(navigation).toContain("new CustomEvent('elephantnote:android-back', { cancelable: true })")
  })

  it('renders local images through Tauri asset URLs and enables the asset protocol', () => {
    const host = read('Elephant/frontend/app/components/editor/NoteEditorHost.vue')
    const config = JSON.parse(read('Elephant/backend/tauri/tauri.android.conf.json'))
    expect(host).toContain('convertFileSrc')
    expect(host).toContain('restoreLocalImageSources')
    expect(host).toContain('/^(?:https?:|asset:|data:|blob:|#)/i')
    expect(config.app.security.assetProtocol.enable).toBe(true)
  })

  it('uses SAF folder authorization and exposes reconnection from settings', () => {
    const native = read('Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt')
    const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
    expect(native).toContain('Intent.ACTION_OPEN_DOCUMENT_TREE')
    expect(native).toContain('persistedUriPermissions.any')
    expect(settings).toContain('Authorize a folder')
  })
})
