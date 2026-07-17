const { test, expect } = require('playwright/test')
const { createSeededVaultFixture, launchElectron, attachPageDiagnostics } = require('./helpers')

test('acceptance bridge opens, edits, saves and reads a real note', async() => {
  const fixture = await createSeededVaultFixture()
  const launch = await launchElectron([], {
    userDataPath: fixture.userDataPath,
    env: {
      ELEPHANTNOTE_CONFIG_DIR: fixture.configRoot,
      ELEPHANT_E2E_VAULT_ROOT: fixture.vaultRoot,
      ELEPHANTNOTE_MUYA_RUNTIME: 'rust'
    }
  })
  const { app, page } = launch
  attachPageDiagnostics(page)
  try {
    await page.waitForSelector('.en-library-grid', { state: 'visible', timeout: 30000 })
    await expect.poll(() => page.evaluate(() => Boolean(window.__ELEPHANT_ACCEPTANCE_TEST__)), {
      timeout: 30000
    }).toBe(true)

    const result = await page.evaluate(async() => {
      const bridge = window.__ELEPHANT_ACCEPTANCE_TEST__
      await bridge.openNote('Alpha.md')
      bridge.setMarkdown('# Acceptance\n\nEdited by the app command bridge.')
      const saved = await bridge.save()
      const displayed = bridge.readDisplayed()
      return { saved, displayed, logs: bridge.logs().map((entry) => entry.event) }
    })

    expect(result.saved.notePath).toBe('Alpha.md')
    expect(result.saved.markdown).toContain('Edited by the app command bridge.')
    expect(result.saved.isSaved).toBe(true)
    expect(result.displayed.notePath).toBe('Alpha.md')
    expect(result.logs).toEqual(expect.arrayContaining([
      'open:start', 'open:done', 'edit:set-markdown', 'save:start', 'save:done', 'read:displayed'
    ]))
  } finally {
    await app.close().catch(() => {})
    const fs = require('node:fs')
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

