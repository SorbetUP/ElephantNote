const { expect, test } = require('@playwright/test')
const { launchElectron } = require('../helpers')

const getBodyText = async(page) => (await page.locator('body').innerText()).trim()

const getVisibleCardTexts = async(page) => {
  const cards = page.locator('.en-note-card')
  const count = await cards.count()
  const texts = []
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index)
    if (await card.isVisible().catch(() => false)) {
      texts.push(await card.innerText())
    }
  }
  return texts
}

test.describe('Native app UI parity contract baseline', () => {
  test('Electron baseline renders without a blank page', async() => {
    const { app, page } = await launchElectron()
    try {
      await expect(page.locator('body')).toBeVisible()
      expect((await getBodyText(page)).length).toBeGreaterThan(0)
      await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('Electron baseline does not show diagnostic overlay during normal startup', async() => {
    const { app, page } = await launchElectron()
    try {
      await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })

  test('Electron baseline note cards do not expose raw metadata when cards are present', async() => {
    const { app, page } = await launchElectron()
    try {
      const texts = await getVisibleCardTexts(page)
      for (const text of texts) {
        expect(text).not.toContain('---')
        expect(text.toLowerCase()).not.toContain('type:')
      }
    } finally {
      await app.close()
    }
  })

  test('Electron baseline visible note cards have titles when cards are present', async() => {
    const { app, page } = await launchElectron()
    try {
      const cards = page.locator('.en-note-card')
      const count = await cards.count()
      for (let index = 0; index < count; index += 1) {
        const card = cards.nth(index)
        if (await card.isVisible().catch(() => false)) {
          const title = card.locator('h3')
          await expect(title).toBeVisible()
          expect((await title.innerText()).trim().length).toBeGreaterThan(0)
        }
      }
    } finally {
      await app.close()
    }
  })

  test('Electron baseline never enables experimental Muya active mode by default', async() => {
    const { app, page } = await launchElectron()
    try {
      const mode = await page.evaluate(() => window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || window.__ELEPHANT_MUYA_RUNTIME_MODE__ || null)
      expect(mode).not.toBe('active')
    } finally {
      await app.close()
    }
  })
})
