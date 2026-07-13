const { expect, test } = require('playwright/test')
const { launchElectron } = require('./helpers')

test.describe('Check Launch ElephantNote', () => {
  let app = null
  let page = null

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('Empty ElephantNote', async() => {
    const title = await page.title()
    expect(/^ElephantNote|Untitled-1 - ElephantNote$/.test(title)).toBeTruthy()
  })
})
