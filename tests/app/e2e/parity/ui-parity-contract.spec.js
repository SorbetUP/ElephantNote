const { expect, test } = require('playwright/test')
const { openTauriRenderer } = require('../helpers')

const getBodyText = async(page) => (await page.locator('body').innerText()).trim()

test.describe('Native Tauri UI parity contract baseline', () => {
  test.beforeEach(async({ page }) => {
    await openTauriRenderer(page)
  })

  test('opens the Tauri renderer without a blank layout', async({ page }) => {
    const app = page.locator('#app[data-v-app]').first()
    await expect(page.locator('body')).toBeVisible()
    await expect(app).toBeAttached()
    await expect.poll(async() => app.evaluate((element) => element.querySelectorAll('*').length)).toBeGreaterThan(0)
    const hasVisibleLayout = await app.locator('*').evaluateAll((elements) => elements.some((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.width > 300 && bounds.height > 200
    }))
    expect(hasVisibleLayout).toBe(true)
    await expect(page.locator('#elephant-diagnostic-overlay')).toHaveCount(0)
  })

  test('installs the native runtime and knowledge API surfaces', async({ page }) => {
    const runtime = await page.evaluate(() => ({
      marktextRuntime: window.__MARKTEXT_RUNTIME__,
      knowledgeRuntime: window.elephantnote?.knowledge?.runtime || '',
      hasSearch: typeof window.elephantnote?.search?.inspect === 'function',
      hasWiki: typeof window.elephantnote?.knowledge?.wikis?.generate === 'function'
    }))

    expect(runtime).toEqual({
      marktextRuntime: 'tauri',
      knowledgeRuntime: 'rust-knowledge-core',
      hasSearch: true,
      hasWiki: true
    })
  })

  test('does not expose raw frontmatter in the initial application shell', async({ page }) => {
    const bodyText = await getBodyText(page)
    expect(bodyText).not.toContain('---')
    expect(bodyText.toLowerCase()).not.toContain('type: "note"')
  })

  test('never enables experimental Muya active mode by default', async({ page }) => {
    const mode = await page.evaluate(() => window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || window.__ELEPHANT_MUYA_RUNTIME_MODE__ || null)
    expect(mode).not.toBe('active')
  })
})
