const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { test, expect, _electron: electron } = require('playwright/test')

const root = process.cwd()
const rendererRoot = path.join(root, 'build/out/renderer')
const electronMain = path.join(root, 'tests/app/e2e/linux-usage-main.cjs')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'tests/app/usage/linux/scenarios.json'), 'utf8'))
const metadata = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario]))

let server
let rendererUrl

const mimeType = (filename) => ({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}[path.extname(filename)] || 'application/octet-stream')

const startStaticServer = async () => {
  server = http.createServer((request, response) => {
    const rawPath = decodeURIComponent(String(request.url || '/').split('?')[0])
    const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '')
    const candidate = path.resolve(rendererRoot, relative)
    if (candidate !== rendererRoot && !candidate.startsWith(`${rendererRoot}${path.sep}`)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const filename = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(rendererRoot, 'index.html')
    response.writeHead(200, {
      'content-type': mimeType(filename),
      'cache-control': 'no-store'
    })
    fs.createReadStream(filename).pipe(response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  rendererUrl = `http://127.0.0.1:${address.port}/`
}

const createFixture = () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'elephant-linux-usage-'))
  const vault = path.join(base, 'vault')
  const config = path.join(base, 'config')
  fs.mkdirSync(path.join(vault, 'Notes'), { recursive: true })
  fs.mkdirSync(path.join(vault, '.elephantnote'), { recursive: true })
  fs.mkdirSync(config, { recursive: true })

  fs.writeFileSync(path.join(vault, 'Getting Started.md'), '# Getting Started\n\nElephant Linux usage fixture.\n\n- Search\n- Settings\n- Rust editor\n')
  fs.writeFileSync(path.join(vault, 'Project Alpha.md'), '# Project Alpha\n\nAlpha planning and requirements.\n')
  fs.writeFileSync(path.join(vault, 'Zeta Note.md'), '# Zeta Note\n\nA note used to verify title sorting.\n')
  fs.writeFileSync(path.join(vault, 'Notes', 'Deep Work.md'), '# Deep Work\n\nNested note fixture.\n')
  fs.writeFileSync(path.join(vault, '.elephantnote', 'workspace.json'), JSON.stringify({
    version: 1,
    vaultName: 'Linux Usage Vault',
    sidebar: []
  }, null, 2))
  fs.writeFileSync(path.join(config, 'elephantnote.json'), JSON.stringify({
    vaults: [{ id: 'linux-usage-vault', name: 'Linux Usage Vault', path: vault }],
    activeVaultId: 'linux-usage-vault'
  }, null, 2))

  return { base, vault, config }
}

const launchUsageApp = async (testInfo) => {
  const fixture = createFixture()
  const app = await electron.launch({
    args: [electronMain],
    env: {
      ...process.env,
      ELEPHANT_E2E_RENDERER_URL: rendererUrl,
      ELEPHANTNOTE_CONFIG_DIR: fixture.config,
      ELEPHANT_E2E_VAULT_ROOT: fixture.vault,
      ELEPHANTNOTE_MUYA_RUNTIME: 'rust'
    }
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.waitForSelector('.en-shell', { state: 'visible', timeout: 30000 })
  await page.waitForSelector('.en-library-grid', { state: 'visible', timeout: 30000 })

  return {
    app,
    page,
    fixture,
    errors,
    async checkpoint(name) {
      const screenshotPath = testInfo.outputPath(`${name}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' })
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        text: document.body.innerText.trim().slice(0, 500)
      }))
      expect(dimensions.width).toBeGreaterThan(500)
      expect(dimensions.height).toBeGreaterThan(400)
      expect(dimensions.text.length).toBeGreaterThan(20)
    },
    async healthy() {
      expect(await page.locator('.en-shell').isVisible()).toBe(true)
      expect(await page.locator('.muya-rust-runtime-error').count()).toBe(0)
      expect(errors, errors.join('\n')).toEqual([])
    },
    async close() {
      await app.close().catch(() => {})
      fs.rmSync(fixture.base, { recursive: true, force: true })
    }
  }
}

const card = (page, title) => page.locator('.en-note-card').filter({ hasText: title }).first()
const searchInput = (page) => page.getByPlaceholder('Search notes, paths, tags, or ideas…')

const closeSearch = async (page) => {
  const input = searchInput(page)
  if (await input.isVisible()) {
    if (await input.inputValue()) await input.press('Escape')
    await input.press('Escape')
  }
  await expect(input).toBeHidden()
}

const openSettings = async (page) => {
  await page.getByRole('button', { name: 'Settings' }).last().click()
  await expect(page.getByRole('dialog', { name: 'ElephantNote settings' })).toBeVisible()
}

const closeSettings = async (page) => {
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog', { name: 'ElephantNote settings' })).toBeHidden()
}

const defineUsageTest = (id, implementation) => {
  const scenario = metadata.get(id)
  test(`[linux-usage:${id}] ${scenario.description}`, async ({}, testInfo) => {
    const context = await launchUsageApp(testInfo)
    try {
      await implementation(context)
      await context.healthy()
    } finally {
      await context.close()
    }
  })
}

test.describe('Linux production-renderer usage regressions', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    expect(fs.existsSync(path.join(rendererRoot, 'index.html'))).toBe(true)
    await startStaticServer()
  })

  test.afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  defineUsageTest('startup-render', async ({ page, checkpoint }) => {
    await expect(page.getByText('Getting Started', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Project Alpha', { exact: true }).first()).toBeVisible()
    await checkpoint('linux-startup-render')
  })

  defineUsageTest('library-layout-roundtrip', async ({ page, checkpoint }) => {
    await checkpoint('linux-layout-grid')
    await page.getByTitle('List').click()
    await expect(page.locator('.en-library-grid')).toHaveClass(/list/)
    await checkpoint('linux-layout-list')
    await page.getByTitle('Grid').click()
    await expect(page.locator('.en-library-grid')).not.toHaveClass(/list/)
    await checkpoint('linux-layout-restored')
  })

  defineUsageTest('library-title-sort', async ({ page, checkpoint }) => {
    await page.locator('.en-library-actions .en-select').selectOption('title')
    await page.waitForTimeout(300)
    const titles = await page.locator('.en-note-card:not(.is-folder) h3').allTextContents()
    const normalized = titles.map((title) => title.trim()).filter(Boolean)
    expect(normalized.indexOf('Project Alpha')).toBeLessThan(normalized.indexOf('Zeta Note'))
    await checkpoint('linux-library-title-sort')
  })

  defineUsageTest('sidebar-hide-show', async ({ page, checkpoint }) => {
    await page.getByRole('button', { name: 'Hide sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
    await expect(page.locator('.en-sidebar')).toHaveCount(0)
    await checkpoint('linux-sidebar-hidden')
    await page.getByRole('button', { name: 'Show sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Hide sidebar' })).toBeVisible()
    await expect(page.locator('.en-sidebar')).toBeVisible()
    await checkpoint('linux-sidebar-restored')
  })

  defineUsageTest('search-roundtrip', async ({ page, checkpoint }) => {
    await page.getByRole('button', { name: 'Search' }).click()
    await searchInput(page).fill('Project Alpha')
    await expect(page.locator('.en-search-results')).toBeVisible()
    await expect(page.getByText('Project Alpha', { exact: true }).last()).toBeVisible()
    await checkpoint('linux-search-results')
    await closeSearch(page)
    await checkpoint('linux-search-closed')
  })

  defineUsageTest('search-no-results', async ({ page, checkpoint }) => {
    await page.getByRole('button', { name: 'Search' }).click()
    await searchInput(page).fill('zzzxxyy-no-linux-match-9173')
    await expect(page.getByText('No matching notes found')).toBeVisible()
    await checkpoint('linux-search-empty')
    await closeSearch(page)
  })

  defineUsageTest('settings-roundtrip', async ({ page, checkpoint }) => {
    await openSettings(page)
    await page.getByRole('searchbox', { name: 'Search all settings' }).fill('autosave')
    await expect(page.getByText('Autosave', { exact: true }).first()).toBeVisible()
    await checkpoint('linux-settings-search')
    await closeSettings(page)
    await checkpoint('linux-settings-closed')
  })

  defineUsageTest('theme-mode-roundtrip', async ({ page, checkpoint }) => {
    const original = await page.evaluate(() => document.documentElement.dataset.elephantnoteTheme || '')
    await openSettings(page)
    const target = original.includes('dark') ? 'Light' : 'Dark'
    await page.getByRole('button', { name: target, exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.elephantnoteTheme || '')).not.toBe(original)
    await checkpoint('linux-theme-toggled')
    const restore = original.includes('dark') ? 'Dark' : 'Light'
    await page.getByRole('button', { name: restore, exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.elephantnoteTheme || '')).toBe(original)
    await closeSettings(page)
  })

  defineUsageTest('open-existing-note', async ({ page, checkpoint }) => {
    await card(page, 'Getting Started').click()
    await expect(page.getByTestId('muya-rust-runtime-editor')).toBeVisible()
    await expect(page.locator('.muya-rust-runtime-error')).toHaveCount(0)
    await checkpoint('linux-note-open')
  })

  defineUsageTest('note-close-roundtrip', async ({ page, checkpoint }) => {
    await card(page, 'Getting Started').click()
    await expect(page.getByTestId('muya-rust-runtime-editor')).toBeVisible()
    await checkpoint('linux-note-first')
    await page.reload()
    await page.waitForSelector('.en-library-grid', { state: 'visible' })
    await card(page, 'Project Alpha').click()
    await expect(page.getByTestId('muya-rust-runtime-editor')).toBeVisible()
    await checkpoint('linux-note-second')
  })

  defineUsageTest('pin-unpin-note', async ({ page, checkpoint }) => {
    const projectCard = card(page, 'Project Alpha')
    await projectCard.hover()
    await projectCard.getByRole('button', { name: 'Pin entry' }).click()
    await expect(projectCard.getByRole('button', { name: 'Unpin entry' })).toBeVisible()
    await checkpoint('linux-note-pinned')
    await projectCard.getByRole('button', { name: 'Unpin entry' }).click()
    await expect(projectCard.getByRole('button', { name: 'Pin entry' })).toBeVisible()
    await checkpoint('linux-note-unpinned')
  })

  defineUsageTest('reload-preserves-vault', async ({ page, checkpoint }) => {
    await checkpoint('linux-before-reload')
    await page.reload()
    await page.waitForSelector('.en-library-grid', { state: 'visible' })
    await expect(page.getByText('Getting Started', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Project Alpha', { exact: true }).first()).toBeVisible()
    await checkpoint('linux-after-reload')
  })

  defineUsageTest('navigation-stress', async ({ page, checkpoint }) => {
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await page.getByRole('button', { name: 'Search' }).click()
      await expect(searchInput(page)).toBeVisible()
      await closeSearch(page)

      await openSettings(page)
      await closeSettings(page)

      await page.getByRole('button', { name: 'Hide sidebar' }).click()
      await page.getByRole('button', { name: 'Show sidebar' }).click()
      await expect(page.locator('.en-sidebar')).toBeVisible()
    }
    await card(page, 'Getting Started').click()
    await expect(page.getByTestId('muya-rust-runtime-editor')).toBeVisible()
    await checkpoint('linux-navigation-stress-complete')
  })
})
