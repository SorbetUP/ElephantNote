import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('AI addon ownership', () => {
  it('keeps local AI disabled in the base configuration', () => {
    const providers = read('Elephant/shared/aiProviders.js')

    expect(providers).toContain('export const createDefaultLocalAiConfig = () => ({\n  enabled: false')
    expect(providers).toContain("const rawProvider = String(restConfig.preset || restConfig.provider || 'custom')")
    expect(providers).toContain('enabled: input.enabled === true')
  })

  it('lets Open Models exclusively own local runtime enablement and cleanup', () => {
    const openModels = read('Elephant/frontend/src/renderer/src/addons/builtin/openModels.js')
    const ownership = read('Elephant/frontend/src/renderer/src/addons/builtin/aiProviderRouteOwnership.js')

    expect(openModels).toContain('const enableOpenModelsRuntime = async () =>')
    expect(openModels).toContain('enabled: true')
    expect(openModels).toContain("capabilities: ['chat', 'embedding']")
    expect(openModels).toContain("disableProviderRoutes(PROVIDER_ID, {")
    expect(openModels).toContain('disableLocalAi: true')
    expect(ownership).toContain("source: 'disabled'")
    expect(ownership).toContain("transport: 'disabled'")
    expect(ownership).toContain("model: ''")
  })

  it('cleans subscription routes through the same shared lifecycle helper', () => {
    const codex = read('Elephant/frontend/src/renderer/src/addons/builtin/codexConnection.js')

    expect(codex).toContain("import { disableProviderRoutes } from './aiProviderRouteOwnership'")
    expect(codex).toContain("disableProviderRoutes(PROVIDER_ID, { capabilities: ['chat'] })")
    expect(codex).not.toContain('const disableCodexRoute = async () =>')
  })
})
