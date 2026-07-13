const { expect, test } = require('playwright/test')
const { launchElectron } = require('./helpers')

test.describe('Atomic workspace visual smoke', () => {
  let app = null
  let page = null

  test.beforeEach(async() => {
    const launched = await launchElectron()
    app = launched.app
    page = launched.page
  })

  test.afterEach(async() => {
    await app?.close()
  })

  test('opens Chat and Canvas workspace views with non-empty layouts', async() => {
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
    await expect(page.getByPlaceholder('Ask across your notes')).toBeVisible()

    const chatShot = await page.screenshot()
    expect(chatShot.length).toBeGreaterThan(10000)

    await page.getByRole('button', { name: 'Canvas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Canvas' })).toBeVisible()
    await expect(page.locator('.en-canvas-stage')).toBeVisible()

    const canvasStage = await page.locator('.en-canvas-stage').boundingBox()
    expect(canvasStage.width).toBeGreaterThan(300)
    expect(canvasStage.height).toBeGreaterThan(200)

    const canvasShot = await page.screenshot()
    expect(canvasShot.length).toBeGreaterThan(10000)
  })
})
