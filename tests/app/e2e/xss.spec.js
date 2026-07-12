const { expect, test } = require('playwright/test')

test.describe('Renderer security policy', () => {
  test('keeps a restrictive default content security policy', async({ page }) => {
    await page.goto('/')

    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("img-src 'self'")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).not.toContain('default-src *')
  })
})
