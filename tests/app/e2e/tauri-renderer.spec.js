const { expect, test } = require('playwright/test')

test.describe('Tauri renderer smoke', () => {
  test('boots the Elephant renderer without Electron', async ({ page }) => {
    const fatalErrors = []
    page.on('pageerror', (error) => {
      if (/SyntaxError|Cannot find module|Failed to resolve module/i.test(error.message)) {
        fatalErrors.push(error.message)
      }
    })

    await page.goto('/')
    await page.waitForFunction(() => {
      const app = document.querySelector('#app')
      return Boolean(app && app.childElementCount > 0)
    })

    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('#app')).not.toBeEmpty()
    await expect(page).toHaveTitle(/Elephant/i)

    const runtime = await page.evaluate(() => ({
      electron: Boolean(globalThis.process?.versions?.electron),
      tauri: Boolean(globalThis.__TAURI__)
    }))
    expect(runtime.electron).toBe(false)
    expect(fatalErrors).toEqual([])
  })

  test('keeps the renderer usable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await page.goto('/')
    await page.waitForFunction(() => document.querySelector('#app')?.childElementCount > 0)

    const bodyBox = await page.locator('body').boundingBox()
    expect(bodyBox?.width).toBeGreaterThanOrEqual(400)
    expect(bodyBox?.height).toBeGreaterThanOrEqual(800)
    await expect(page.locator('#app')).toBeVisible()
  })
})
