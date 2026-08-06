#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appPath, assert, cleanup, command, createFixture, ensureVault, expectFailure,
  installEnable, markdownDigest, startApplication, waitNative, writeResult
} from './addon-acceptance-harness.mjs'

const scenarioId = String(process.env.ELEPHANT_INTERACTION_SCENARIO || 'base-addon-api').trim()

const baseAddonApi = async(context) => {
  const capabilities = await command(context, 'capabilities')
  assert(capabilities.runtime === 'tauri' && ['invokeTauri', 'readDom', 'readState'].every((name) => capabilities.commands.includes(name)), 'Base API capability contract is incomplete', capabilities)
  const core = await command(context, 'core')
  assert(core && typeof core === 'object', 'Core read model is invalid', core)
  const rendered = await command(context, 'invokeTauri', 'tauri_markdown_render_html', { markdown: '# API\n\n[[Linked Note]]' })
  const plain = await command(context, 'invokeTauri', 'tauri_markdown_to_text', { markdown: '# API\n\nBody' })
  const links = await command(context, 'invokeTauri', 'tauri_markdown_extract_links', { markdown: '[[Linked Note]]\n[File](Acceptance.md)' })
  assert(rendered?.html?.includes('<h1>API</h1>') && plain?.text?.includes('Body') && links?.links?.length >= 2, 'Markdown base API contract failed', { rendered, plain, links })

  const folder = await command(context, 'invokeTauri', 'tauri_folders_create', { relativePath: 'API' })
  const created = await command(context, 'invokeTauri', 'tauri_notes_create', { relativePath: 'API', filename: 'Created.md', title: 'Created' })
  await command(context, 'openNote', 'API/Created.md')
  await command(context, 'setMarkdown', '# Created\n\nBase API round trip.')
  const saved = await command(context, 'save')
  const disk = await command(context, 'readNote', 'API/Created.md')
  assert(folder?.path && created?.path && saved.isSaved && disk.content.includes('Base API round trip'), 'Create/write/read API failed', { folder, created, saved, disk })
  await command(context, 'invokeTauri', 'tauri_entries_rename', { relativePath: 'API/Created.md', title: 'Renamed' })
  await command(context, 'invokeTauri', 'tauri_entries_move', { relativePath: 'API/Renamed.md', targetDirectoryPath: '.' })
  const moved = await command(context, 'readNote', 'Renamed.md')
  assert(moved.content.includes('Base API round trip'), 'Rename/move API lost contents', moved)
  const attachment = await command(context, 'invokeTauri', 'tauri_attachments_write_text', { relativePath: 'api-contract.txt', content: 'attachment contract' })
  const attachments = await command(context, 'invokeTauri', 'tauri_attachments_list')
  assert(attachment?.ok && attachments.some((entry) => JSON.stringify(entry).includes('api-contract.txt')), 'Attachment API failed', { attachment, attachments })
  const search = await command(context, 'invokeTauri', 'tauri_search_query', { params: { query: 'Base API round trip', limit: 10 } })
  assert(search.some((entry) => JSON.stringify(entry).includes('Base API round trip')), 'Search API did not observe save', search)
  const traversal = await expectFailure(context, 'invokeTauri', 'tauri_notes_read', { relativePath: '../outside.md' })
  const unknownNative = await expectFailure(context, 'invokeTauri', 'tauri_nonexistent_contract_probe', {})
  const unknownSurface = await expectFailure(context, 'unknownAcceptanceCommand')

  const initial = await command(context, 'addonState')
  assert(Array.isArray(initial.addons) && Array.isArray(initial.resources) && Array.isArray(initial.actions), 'Addon API state shape is invalid', initial)
  await expectFailure(context, 'installOfficialAddon', 'elephant.not-real')
  await installEnable(context, 'elephant.wiki')
  await command(context, 'installOfficialAddon', 'elephant.wiki')
  let state = await command(context, 'addonState')
  assert(state.addons.filter((entry) => entry.id === 'elephant.wiki').length === 1, 'Duplicate install duplicated addon state', state)
  const status = await command(context, 'invokeAddonResource', 'wiki.provider', 'status')
  assert(status.engine === 'package-owned-wiki' && status.targetedActions === true, 'Addon resource status is invalid', status)
  const unknownResource = await expectFailure(context, 'invokeAddonResource', 'missing.resource', 'status')
  const unknownMethod = await expectFailure(context, 'invokeAddonResource', 'wiki.provider', 'missingMethod')
  await command(context, 'disableAddon', 'elephant.wiki')
  state = await command(context, 'addonState')
  assert(state.addons.find((entry) => entry.id === 'elephant.wiki')?.enabled === false, 'disableAddon did not update state', state)
  await expectFailure(context, 'invokeAddonResource', 'wiki.provider', 'status')
  await command(context, 'enableAddon', 'elephant.wiki')
  state = await command(context, 'addonState')
  const resourceKeys = state.resources.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry))
  const actionKeys = state.actions.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry))
  assert(new Set(resourceKeys).size === resourceKeys.length && new Set(actionKeys).size === actionKeys.length, 'Addon API registered duplicate resources/actions', state)
  return { capabilities, coreKeys: Object.keys(core).sort(), rendered, links, traversal, unknownNative, unknownSurface, status, unknownResource, unknownMethod, addonCount: state.addons.length, resourceCount: state.resources.length, actionCount: state.actions.length }
}

const wikiKnowledgeGraph = async(context) => {
  writeFileSync(join(context.vaultRoot, 'Integration A.md'), '# Integration A\n\nCross-addon anatomy source #integration.\n')
  writeFileSync(join(context.vaultRoot, 'Integration B.md'), '# Integration B\n\nSecond source #integration.\n\n[[Integration A]]\n')
  for (const addonId of ['elephant.knowledge', 'elephant.wiki', 'elephant.graph']) await installEnable(context, addonId)
  await waitNative(context, 'elephant.knowledge', true)
  await command(context, 'invokeAddonResource', 'knowledge.provider', 'rebuild')
  const proposal = await command(context, 'invokeAddonResource', 'wiki.provider', 'propose', 'Integrated Anatomy', { title: 'Integrated Anatomy', sourcePaths: ['Integration A.md', 'Integration B.md'] })
  const accepted = await command(context, 'invokeAddonResource', 'wiki.provider', 'accept', proposal.id)
  assert(String(accepted.path).startsWith('Wiki/'), 'Wiki did not materialize integrated page', accepted)
  await command(context, 'invokeAddonResource', 'knowledge.provider', 'rebuild')
  const search = await command(context, 'invokeAddonResource', 'knowledge.provider', 'search', 'Integrated Anatomy', { limit: 20 })
  assert(search.some((entry) => JSON.stringify(entry).includes(accepted.path)), 'Knowledge did not index Wiki output', { accepted, search })
  const projection = await command(context, 'invokeAddonResource', 'knowledge.provider', 'graph', { includeSuggestions: true })
  const graph = await command(context, 'runAddonAction', 'elephant.graph.rebuild')
  const wikiNode = graph.nodes.find((node) => String(node.path || node.relativePath) === accepted.path)
  assert(wikiNode, 'Graph did not consume Knowledge/Wiki node', { accepted, graph })
  assert(graph.edges.some((edge) => String(edge.source) === String(wikiNode.id) || String(edge.target) === String(wikiNode.id)), 'Integrated Wiki node has no edge', { wikiNode, edges: graph.edges })
  await command(context, 'runAddonAction', 'elephant.graph.open')
  const svg = await command(context, 'waitFor', '.elephant-graph-svg', 20000)
  const wikiStatus = await command(context, 'invokeAddonResource', 'wiki.provider', 'status')
  assert(wikiStatus.knowledgeProvider === true && svg.exists, 'Wiki/Knowledge/Graph runtime linkage is incomplete', { wikiStatus, svg })
  return { proposal, accepted, searchCount: search.length, knowledgeGraph: { nodes: projection.nodes.length, edges: projection.edges.length }, graph: { nodes: graph.nodes.length, edges: graph.edges.length, engine: graph.engine }, wikiNode, wikiStatus }
}

const uiContributions = async(context) => {
  for (let index = 1; index <= 6; index += 1) writeFileSync(join(context.vaultRoot, `Interaction ${index}.md`), `# Interaction ${index}\n\nRecent interaction ${index}.\n`)
  for (const addonId of ['elephant.recently-edited', 'elephant.dashboard', 'elephant.calendar']) await installEnable(context, addonId)
  for (let index = 1; index <= 6; index += 1) await command(context, 'openNote', `Interaction ${index}.md`)
  await command(context, 'runAddonAction', 'elephant.dashboard.open')
  const dashboard = await command(context, 'readNote', '.elephantnote/Dashboard.md')
  const quick = await command(context, 'readNote', '.elephantnote/Quick Notes.md')
  assert(dashboard.content.includes('Dashboard') && typeof quick.content === 'string', 'Dashboard contributions failed', { dashboard, quick })
  const recent = await command(context, 'waitFor', '.elephant-recent-list', 10000)
  assert(recent.text.includes('Dashboard') || recent.text.includes('Interaction 6'), 'Recently Edited did not observe core/addon opens', recent)

  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:interaction-event\nSUMMARY:Interaction event\nDTSTART:20260806T100000Z\nDTEND:20260806T110000Z\nEND:VEVENT\nEND:VCALENDAR'
  const imported = await command(context, 'invokeAddonResource', 'calendar.provider', 'importIcs', ics, 'interaction.ics')
  const listed = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(imported.imported === 1 && listed.some((event) => event.id === 'interaction-event'), 'Calendar provider interaction failed', { imported, listed })
  await command(context, 'runAddonAction', 'elephant.calendar.open')
  const event = await command(context, 'waitFor', '.elephant-calendar-event', 10000)
  assert(event.text.includes('Interaction event'), 'Calendar UI did not expose provider result', event)
  const state = await command(context, 'addonState')
  const enabled = state.addons.filter((entry) => entry.enabled).map((entry) => entry.id)
  assert(['elephant.recently-edited', 'elephant.dashboard', 'elephant.calendar'].every((id) => enabled.includes(id)), 'Cross-addon enabled state is incomplete', state)
  const resourceKeys = state.resources.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry))
  const actionKeys = state.actions.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry))
  assert(new Set(resourceKeys).size === resourceKeys.length && new Set(actionKeys).size === actionKeys.length, 'Cross-addon contributions collided', state)
  return { imported, listed, event: event.text, recent: recent.text, enabled, resources: state.resources, actions: state.actions }
}

const scenarios = { 'base-addon-api': baseAddonApi, 'wiki-knowledge-graph': wikiKnowledgeGraph, 'ui-contributions': uiContributions }
const context = createFixture(scenarioId)
const startedAt = new Date().toISOString()
let result
try {
  assert(scenarios[scenarioId], `Unknown interaction scenario: ${scenarioId}`)
  await startApplication(context)
  await ensureVault(context)
  const before = markdownDigest(context.vaultRoot)
  const functional = await scenarios[scenarioId](context)
  result = { scenarioId, status: 'PASS', evidenceLevel: 'packaged-api-functional-interaction', startedAt, finishedAt: new Date().toISOString(), commit: process.env.ELEPHANT_TEST_COMMIT || process.env.GITHUB_SHA || null, appPath, before, functional }
} catch (error) {
  result = { scenarioId, status: 'FAIL', evidenceLevel: 'packaged-api-functional-interaction', startedAt, finishedAt: new Date().toISOString(), commit: process.env.ELEPHANT_TEST_COMMIT || process.env.GITHUB_SHA || null, appPath, error: error instanceof Error ? error.message : String(error), details: error?.details || null, stack: error instanceof Error ? error.stack : null, logTail: context.output.slice(-30000) }
} finally {
  await cleanup(context)
}
writeResult(scenarioId, result)
console.log(`[interaction] result ${JSON.stringify({ scenarioId, status: result.status, error: result.error || null })}`)
if (result.status !== 'PASS') process.exitCode = 1
