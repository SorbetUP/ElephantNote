const { expect, test } = require('playwright/test')

test.describe('Elephant Tauri renderer', () => {
  test('boots a non-empty application shell', async({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Elephant/i)
    await expect(page.locator('#app')).toBeAttached()
    await expect.poll(async() => page.locator('#app').evaluate((element) => element.childElementCount)).toBeGreaterThan(0)

    const body = await page.locator('body').boundingBox()
    expect(body?.width || 0).toBeGreaterThan(600)
    expect(body?.height || 0).toBeGreaterThan(400)
  })
})
