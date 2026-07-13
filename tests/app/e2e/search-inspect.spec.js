const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { expect, test } = require('playwright/test')
const { launchElectron } = require('./helpers')

test.describe('ElephantNote search settings inspection', () => {
  let app = null
  let page = null
  let vaultRoot = null

  test.beforeAll(async() => {
    vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-e2e-search-'))
    await fs.ensureDir(path.join(vaultRoot, 'Projects'))
    await fs.writeFile(path.join(vaultRoot, 'Projects', 'Visible note.md'), '# Visible note\n\nSearch panel content.', 'utf8')

    const launched = await launchElectron()
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    await app?.close()
    await fs.remove(vaultRoot)
  })

  test('inspects vault markdown without creating a core semantic index', async() => {
    const result = await page.evaluate(async(root) => {
      const unwrap = (response) => {
        if (response?.ok === false) {
          throw new Error(response.error?.message || 'ElephantNote API request failed.')
        }
        return response?.data ?? response
      }

      unwrap(await window.elephantnote.api.call('search.initVault', { vaultPath: root }))
      return unwrap(await window.elephantnote.api.call('search.inspect'))
    }, vaultRoot)

    expect(result.indexPath).toBe('')
    expect(result.provider).toBe('tauri-rust')
    expect(result.engine).toBe('portable-markdown-index')
    expect(result.embedding).toMatchObject({ status: 'not-configured' })
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({
      title: 'Visible note',
      relativePath: 'Projects/Visible note.md',
      folder: 'Projects',
      type: 'md',
      indexed: false
    })
    expect(result.folders).toEqual([{ name: 'Projects', count: 1 }])
  })
})
