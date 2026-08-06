import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8')

describe('legacy call removal', () => {
  it('removes the obsolete legacy call table', () => {
    expect(fs.existsSync(path.resolve(
      root,
      'Elephant/front/app/services/elephantnoteClient/legacyCalls.js'
    ))).toBe(false)
  })

  it('keeps the public client on the versioned API runtime', () => {
    const client = read('Elephant/front/app/services/elephantnoteClient.js')
    expect(client).toContain('createApiCaller')
    expect(client).not.toContain('LEGACY_CALLS')
    expect(client).not.toContain('legacyCalls')
  })

  it('does not expose raw Tauri invoke calls from domain clients', () => {
    const domains = read('Elephant/front/app/services/elephantnoteClient/domainClients.js')
    expect(domains).not.toContain('__TAURI__')
    expect(domains).not.toContain('.core.invoke(')
    expect(domains).not.toContain('getBridge')
  })
})
