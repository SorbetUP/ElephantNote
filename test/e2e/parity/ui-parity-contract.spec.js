import { expect, test } from '@playwright/test'

const baseURL = process.env.ELEPHANT_E2E_URL || 'http://127.0.0.1:1420'

const gotoEditor = async(page) => {
  await page.goto(`${baseURL}/#/editor`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
}

test.describe('Electron/Tauri UI parity contract', () => {
  test('app shell renders without a blank page', async({ page }) => {
    await gotoEditor(page)
    const bodyText = await page.locator('body').innerText()
    await expect(page.locator('body')).toBeVisible()
    expect(bodyText.trim().length).toBeGreaterThan(0)
    await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)
  })

  test('diagnostic overlay is absent during normal startup', async({ page }) => {
    await gotoEditor(page)
    await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)
  })

  test('note cards must not show raw metadata delimiters', async({ page }) => {
    await gotoEditor(page)
    const cardText = await page.locator('.en-note-card').allInnerTexts().catch(() => [])
    for (const text of cardText) {
      expect(text).not.toContain('---')
      expect(text.toLowerCase()).not.toContain('type:')
    }
  })

  test('note cards have visible title areas when present', async({ page }) => {
    await gotoEditor(page)
    const cards = page.locator('.en-note-card')
    const count = await cards.count()
    for (let i = 0; i < count; i += 1) {
      const title = cards.nth(i).locator('h3')
      await expect(title).toBeVisible()
      const text = await title.innerText()
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })

  test('editor host is visible when a note is open or app is ready', async({ page }) => {
    await gotoEditor(page)
    const editorLike = page.locator('.en-editor-host, .editor, [data-testid="muya-runtime-editor"]')
    await expect(editorLike.first()).toBeVisible({ timeout: 5000 })
  })

  test('runtime mode is not active by default in Tauri', async({ page }) => {
    await gotoEditor(page)
    const mode = await page.evaluate(() => window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || window.__ELEPHANT_MUYA_RUNTIME_MODE__ || null)
    expect(mode).not.toBe('active')
  })
})
