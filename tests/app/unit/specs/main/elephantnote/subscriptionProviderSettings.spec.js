import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsPath = path.resolve(
  process.cwd(),
  'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'
)
const source = fs.readFileSync(settingsPath, 'utf8')

describe('subscription-backed AI settings', () => {
  it('uses the real Codex runtime account, login and model operations', () => {
    expect(source).toContain('api.authStatus()')
    expect(source).toContain("api.login({ flow: 'chatgpt' })")
    expect(source).toContain('api.logout()')
    expect(source).toContain('api.listModels()')
    expect(source).toContain('startCodexPolling()')
  })

  it('does not restore the former fake Codex toggle or hard-coded model', () => {
    expect(source).not.toContain('form.value.codex.connected = !form.value.codex.connected')
    expect(source).not.toContain('gpt-5.1-codex')
    expect(source).not.toContain('Codex connecté.')
  })

  it('connects OpenCode through its real local runtime bridge', () => {
    expect(source).toContain('<option value="opencode">OpenCode server</option>')
    expect(source).toContain("opencode: { label: 'OpenCode', endpoint: 'http://127.0.0.1:4096' }")
    expect(source).toContain('await api.status(credentials)')
    expect(source).toContain('await api.listModels(credentials)')
  })
})
