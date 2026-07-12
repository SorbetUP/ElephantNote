const { expect, test } = require('playwright/test')
const { openTauriRenderer } = require('./helpers')

test.describe('Elephant Tauri renderer', () => {
  test('boots a non-empty application shell', async({ page }) => {
    await openTauriRenderer(page)

    const app = page.locator('#app[data-v-app]').first()
    await expect(page).toHaveTitle(/Elephant/i)
    await expect(app).toBeAttached()
    await expect.poll(async() => app.evaluate((element) => element.childElementCount)).toBeGreaterThan(0)
    await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)

    const body = await page.locator('body').boundingBox()
    expect(body?.width || 0).toBeGreaterThan(600)
    expect(body?.height || 0).toBeGreaterThan(400)
  })
})
