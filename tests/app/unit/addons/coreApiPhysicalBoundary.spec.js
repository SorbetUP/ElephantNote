import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const absolute = (file) => path.join(root, file)
const read = (file) => fs.readFileSync(absolute(file), 'utf8')

const OPTIONAL_ACTIONS = Object.freeze([
  'ai.config.get',
  'ai.config.set',
  'ai.config.test',
  'models.selection.get',
  'models.selection.set',
  'models.local.list',
  'models.download',
  'ocr.extract',
  'search.inspect',
  'search.rebuild',
  'search.concepts',
  'search.initVault',
  'rag.chat',
  'sync.status',
  'sync.plan',
  'sync.enqueue',
  'sync.run',
  'wiki.list',
  'wiki.propose',
  'graph.rebuild',
  'sites.list',
  'calendar.list',
  'programs.run'
])

describe('minimal core API physical boundary', () => {
  it('does not advertise optional addon actions in the global API contract', () => {
    const contracts = read('Elephant/shared/apiContracts.js')
    expect(contracts).toContain("VAULTS_GET', 'vaults.get")
    expect(contracts).toContain("SEARCH_QUERY', 'search.query")
    expect(contracts).toContain("FEATURES_GET', 'features.get")
    for (const action of OPTIONAL_ACTIONS) expect(contracts).not.toContain(action)
  })

  it('does not route optional addon actions through compatibility calls', () => {
    const compatibility = read('Elephant/frontend/app/services/elephantnoteClient/compatibilityCalls.js')
    for (const action of OPTIONAL_ACTIONS) expect(compatibility).not.toContain(action)
    expect(compatibility).toContain("'notes.read'")
    expect(compatibility).toContain("'search.query'")
  })

  it('does not construct optional addon domain clients in the core renderer', () => {
    const domains = read('Elephant/frontend/app/services/elephantnoteClient/domainClients.js')
    const optionalDomains = [
      'sources:',
      'wiki:',
      'models:',
      'ai:',
      'ocr:',
      'sites:',
      'calendar:',
      'sync:',
      'programs:',
      'automation:',
      'plugins:'
    ]
    for (const domain of optionalDomains) expect(domains).not.toContain(domain)
    expect(domains).toContain('vaults:')
    expect(domains).toContain('notes:')
    expect(domains).toContain('search:')
  })

  it('keeps the atomic fallback generic instead of implementing extracted features', () => {
    const atomic = read('Elephant/frontend/app/services/elephantnoteClient/atomicFeatureApi.js')
    expect(atomic).toContain('describeApi:')
    expect(atomic).toContain('callApi:')
    expect(atomic).toContain('providers:')
    for (const method of [
      'semanticSearch:',
      'suggestTags:',
      'summarize:',
      'graphCluster:',
      'wikiPropose:',
      'wikiGenerate:',
      'localModelInstall:',
      'localModelList:'
    ]) expect(atomic).not.toContain(method)
  })

  it('compiles only generic core commands and stores AI configuration in its package', () => {
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    const commands = read('Elephant/backend/tauri/src/core_commands.rs')
    const aiPackage = read('addons/official/ai/main.js')

    expect(fs.existsSync(absolute('Elephant/backend/tauri/src/tauri_extra_commands.rs'))).toBe(false)
    expect(lib).toContain('#[path = "core_commands.rs"]')
    for (const marker of [
      'tauri_ai_config_',
      'tauri_models_',
      'tauri_search_inspect',
      'tauri_search_rebuild',
      'iroh_sync_'
    ]) {
      expect(lib).not.toContain(marker)
      expect(commands).not.toContain(marker)
    }
    expect(aiPackage).toContain("const CONFIG_KEY = 'provider-config'")
    expect(aiPackage).toContain('this.api.storage.get(CONFIG_KEY)')
    expect(aiPackage).toContain('this.api.storage.set(CONFIG_KEY, payload)')
    expect(aiPackage).not.toContain('tauri_ai_config_')
  })
})
