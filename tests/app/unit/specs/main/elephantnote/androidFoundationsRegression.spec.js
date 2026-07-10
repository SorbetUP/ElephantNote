import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('Android storage, camera and drawer foundations', () => {
  test('private hidden assets are explicit and binary vault writes bypass frontend fs scope', () => {
    const capabilities = source('Elephant/backend/tauri/capabilities/default.json')
    const rust = source('Elephant/backend/tauri/src/vault_binary_commands.rs')
    const bridge = source('Elephant/frontend/src/renderer/src/platform/tauriFileUtilsPathGuards.js')
    expect(capabilities).toContain('/data/user/0/com.elephantnote.app/**/.assets/**/*')
    expect(capabilities).toContain('/data/data/com.elephantnote.app/**/.assets/**/*')
    expect(rust).toContain('tauri_vault_write_binary')
    expect(bridge).toContain("invoke(target, 'tauri_vault_write_binary'")
  })

  test('advanced Android vaults use a persistent document tree', () => {
    const kotlin = source('Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt')
    const bridge = source('Elephant/frontend/src/renderer/src/platform/mobileVaultBridge.js')
    expect(kotlin).toContain('Intent.ACTION_OPEN_DOCUMENT_TREE')
    expect(kotlin).toContain('takePersistableUriPermission')
    expect(kotlin).toContain('DocumentFile.fromTreeUri')
    expect(bridge).toContain("invoke(target, 'tauri_android_vault_pick')")
    expect(bridge).not.toContain("startsWith('content://')")
  })

  test('all vault mutations participate in crash-resilient SAF synchronization', () => {
    const client = source('Elephant/frontend/app/services/elephantnoteClient.js')
    const bridge = source('Elephant/frontend/src/renderer/src/platform/mobileVaultBridge.js')
    const fileUtils = source('Elephant/frontend/src/renderer/src/platform/tauriFileUtilsPathGuards.js')
    expect(client).toContain("new CustomEvent('elephantnote:vault-mutated'")
    expect(bridge).toContain('MOBILE_ADVANCED_DIRTY_KEY')
    expect(bridge).toContain('hasPendingAdvancedWrites')
    expect(fileUtils).toContain('ANDROID_ADVANCED_DIRTY_KEY')
  })

  test('QR image selection never requests the Samsung WebView camera picker', () => {
    const scanner = source('Elephant/frontend/app/components/settings/SyncQrScanner.vue')
    expect(scanner).not.toContain('capture="environment"')
    expect(scanner).toContain('@tauri-apps/plugin-barcode-scanner')
    expect(scanner).toContain('requestPermissions')
  })

  test('drawer gesture state belongs to Vue and no detached DOM runtime remains', () => {
    const shell = source('Elephant/frontend/app/components/shell/AppShell.vue')
    const runtime = source('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    expect(shell).toContain('const drawerProgress = ref(1)')
    expect(shell).toContain('handleDrawerPointerMove')
    expect(runtime).not.toContain('MutationObserver')
    expect(runtime).not.toContain('createEdgeHandle')
    expect(runtime).not.toContain('clearInteractiveDrawerPosition')
  })
})
