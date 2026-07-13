const { expect, test } = require('playwright/test')

const installTauriMock = async (page) => {
  await page.addInitScript(() => {
    const invoke = async (command) => {
      if (command === 'tauri_platform_info') {
        return { os: 'linux', family: 'unix', arch: 'x86_64', mobile: false, desktop: true, linux: true, macos: false, android: false }
      }
      if (command === 'tauri_vaults_get') {
        return { vaults: [], activeVault: null, activeVaultId: null }
      }
      if (command === 'tauri_knowledge_status') {
        return { documents: 0, indexedDocuments: 0, databasePath: '' }
      }
      if (command === 'tauri_models_get_selection') {
        return { embedding: '', chat: '', ocr: '' }
      }
      if (command === 'tauri_ai_config_get') {
        return { localAi: { enabled: true }, localRuntime: {}, providers: { list: [] }, routes: {}, localModelSelection: {} }
      }
      if (command === 'tauri_features_get') {
        return { askAi: true, sitePreview: false, gitSync: false }
      }
      if (command.endsWith('_list') || command.includes('directory_list') || command.includes('relations_list')) {
        return []
      }
      if (command.endsWith('_all')) return {}
      if (command.endsWith('_get')) return null
      return {}
    }

    const fs = {
      stat: async () => ({ isFile: false, isDirectory: false }),
      readDir: async () => [],
      readTextFile: async () => '',
      readFile: async () => new Uint8Array(),
      writeTextFile: async () => {},
      writeFile: async () => {},
      mkdir: async () => {},
      remove: async () => {},
      rename: async () => {},
      copyFile: async () => {}
    }

    globalThis.__TAURI__ = { core: { invoke }, fs }
    globalThis.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: (path) => `asset://localhost/${encodeURIComponent(path)}`,
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      }
    }
  })
}

const onboardingHeading = (page) => page.getByRole('heading', { name: 'Choose your first vault' })

test.describe('Tauri renderer smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page)
  })

  test('boots the Elephant renderer without Electron', async ({ page }) => {
    const fatalErrors = []
    page.on('pageerror', (error) => {
      if (/SyntaxError|Cannot find module|Failed to resolve module/i.test(error.message)) {
        fatalErrors.push(error.message)
      }
    })

    await page.goto('/')
    await expect(onboardingHeading(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose vault' })).toBeVisible()
    await expect(page.locator('#app[data-v-app]')).not.toBeEmpty()
    await expect(page.locator('body')).toBeVisible()
    await expect(page).toHaveTitle(/Elephant/i)

    const runtime = await page.evaluate(() => ({
      electron: Boolean(globalThis.process?.versions?.electron),
      tauri: Boolean(globalThis.__TAURI__),
      mode: globalThis.__MARKTEXT_RUNTIME__
    }))
    expect(runtime).toMatchObject({ electron: false, tauri: true, mode: 'tauri' })
    expect(fatalErrors).toEqual([])
  })

  test('keeps the renderer usable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await page.goto('/')
    await expect(onboardingHeading(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose vault' })).toBeVisible()

    const bodyBox = await page.locator('body').boundingBox()
    expect(bodyBox?.width).toBeGreaterThanOrEqual(400)
    expect(bodyBox?.height).toBeGreaterThanOrEqual(800)
  })
})
