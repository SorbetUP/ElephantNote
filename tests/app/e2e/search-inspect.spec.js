const fs = require('fs-extra')
const { expect, test } = require('playwright/test')
const { launchElectronWithSeededVault } = require('./helpers')

test.describe('ElephantNote search settings inspection', () => {
  let app = null
  let page = null
  let fixture = null

  test.beforeAll(async() => {
    const launched = await launchElectronWithSeededVault()
    app = launched.app
    page = launched.page
    fixture = launched.fixture
  })

  test.afterAll(async() => {
    await app?.close()
    await fs.remove(fixture?.root)
  })

  test('inspects active-vault markdown without creating a core semantic index', async() => {
    const result = await page.evaluate(async() => {
      const response = await window.elephantnote.api.call('search.inspect')
      if (response?.ok === false) {
        throw new Error(response.error?.message || 'ElephantNote API request failed.')
      }
      return response?.data ?? response
    })

    expect(result.indexPath).toBe('')
    expect(result.documents.map((document) => document.title)).toEqual(
      expect.arrayContaining(['Alpha note', 'Beta project'])
    )
    expect(result.documents.every((document) => document.indexed === false)).toBe(true)
    expect(result.folders).toEqual([{ name: 'Projects', count: 1 }])
  })
})
