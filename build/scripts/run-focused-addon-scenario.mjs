#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appPath, assert, cleanup, command, createFixture, ensureVault, installEnable,
  markdownDigest, relativeFiles, startApplication, waitNative, writeResult
} from './addon-acceptance-harness.mjs'

const scenarioId = String(process.env.ELEPHANT_FOCUSED_ADDON || 'dashboard').trim()
const calendarIcs = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:focused-calendar-event\nSUMMARY:Focused calendar event\nDTSTART:20260806T100000Z\nDTEND:20260806T110000Z\nLOCATION:Acceptance room\nDESCRIPTION:Persistent addon event\nEND:VEVENT\nEND:VCALENDAR'

const dashboard = async(context) => {
  const before = markdownDigest(context.vaultRoot)
  await installEnable(context, 'elephant.dashboard')
  await command(context, 'runAddonAction', 'elephant.dashboard.open')
  const note = await command(context, 'readNote', '.elephantnote/Dashboard.md')
  const quick = await command(context, 'readNote', '.elephantnote/Quick Notes.md')
  const state = await command(context, 'readState')
  assert(note.content.includes('Dashboard') && state.notePath?.endsWith('.elephantnote/Dashboard.md'), 'Dashboard generation/open failed', { note, state })
  assert(typeof quick.content === 'string', 'Quick Notes was not materialized', quick)
  await command(context, 'runAddonAction', 'elephant.dashboard.open')
  const after = markdownDigest(context.vaultRoot)
  const created = Object.keys(after).filter((path) => !(path in before)).sort()
  const allowed = ['.elephantnote/Dashboard.md', '.elephantnote/Quick Notes.md']
  assert(created.length === 2 && created.every((path) => allowed.includes(path)), 'Dashboard file effects differ from contract', { created, allowed })
  assert(Object.keys(before).every((path) => before[path] === after[path]), 'Dashboard modified pre-existing Markdown', { before, after })
  return { created, dashboardBytes: Buffer.byteLength(note.content), quickNotesBytes: Buffer.byteLength(quick.content) }
}

const recentlyEdited = async(context) => {
  for (let index = 1; index <= 8; index += 1) {
    const label = String(index).padStart(2, '0')
    writeFileSync(join(context.vaultRoot, `Recent ${label}.md`), `# Recent ${label}\n\nFixture ${label}.\n`)
  }
  const before = markdownDigest(context.vaultRoot)
  await installEnable(context, 'elephant.recently-edited')
  for (let index = 1; index <= 8; index += 1) await command(context, 'openNote', `Recent ${String(index).padStart(2, '0')}.md`)
  const initial = await command(context, 'waitFor', '.elephant-recent-list', 10000)
  for (const label of ['Recent 08', 'Recent 07', 'Recent 06', 'Recent 05', 'Recent 04']) assert(initial.text.includes(label), `Initial recent list misses ${label}`, initial)
  assert(!initial.text.includes('Recent 03'), 'Initial recent list exceeds five notes', initial)
  await command(context, 'click', '.elephant-recent-more')
  const expanded = await command(context, 'readDom', '.elephant-recent-list')
  assert(expanded.text.includes('Recent 01') && expanded.text.includes('Recent 08'), 'Show more failed', expanded)
  await command(context, 'click', '.elephant-recent-heading')
  const collapsed = await command(context, 'readDom', '.elephant-recent-list')
  assert(collapsed.visible === false || collapsed.attributes?.hidden !== undefined, 'Collapse failed', collapsed)
  assert(JSON.stringify(markdownDigest(context.vaultRoot)) === JSON.stringify(before), 'Recently Edited modified Markdown')
  return { initial: initial.text, expanded: expanded.text, collapsedVisible: collapsed.visible }
}

const calendar = async(context) => {
  const before = markdownDigest(context.vaultRoot)
  await installEnable(context, 'elephant.calendar')
  await command(context, 'runAddonAction', 'elephant.calendar.open')
  await command(context, 'waitFor', '.elephant-calendar-package', 10000)
  const imported = await command(context, 'invokeAddonResource', 'calendar.provider', 'importIcs', calendarIcs, 'focused.ics')
  const listed = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(imported.imported === 1 && listed.length === 1 && listed[0].id === 'focused-calendar-event', 'Calendar import/list failed', { imported, listed })
  const live = await command(context, 'waitFor', '.elephant-calendar-event', 10000)
  assert(live.text.includes('Focused calendar event'), 'Provider import did not live-refresh Calendar UI', live)

  const { stopApplication, startApplication, ensureVault: reopenVault } = await import('./addon-acceptance-harness.mjs')
  await stopApplication(context)
  await startApplication(context)
  await reopenVault(context)
  const state = await command(context, 'addonState')
  const addon = state.addons.find((entry) => entry.id === 'elephant.calendar')
  assert(addon?.enabled === true && !addon?.error, 'Calendar enablement did not persist', addon)
  const persisted = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(persisted.length === 1 && persisted[0].id === 'focused-calendar-event', 'Calendar event did not persist', persisted)
  await command(context, 'runAddonAction', 'elephant.calendar.open')
  const persistedUi = await command(context, 'waitFor', '.elephant-calendar-event', 10000)
  assert(persistedUi.text.includes('Focused calendar event'), 'Persisted event did not render', persistedUi)
  await command(context, 'invokeAddonResource', 'calendar.provider', 'clear')
  const empty = await command(context, 'waitFor', '.elephant-calendar-list .elephant-package-muted', 10000)
  assert(empty.text.includes('No calendar event'), 'Provider clear did not live-refresh Calendar UI', empty)
  assert(JSON.stringify(markdownDigest(context.vaultRoot)) === JSON.stringify(before), 'Calendar modified Markdown')
  return { imported, persisted, liveRefresh: true, clearRefresh: true }
}

const googleKeep = async(context) => {
  await installEnable(context, 'elephant.google-keep-import')
  const documents = [
    { name: 'one.json', content: { title: 'Imported acceptance', textContent: 'Keep one', labels: [{ name: 'qa' }], listContent: [{ text: 'done', isChecked: true }] } },
    { name: 'two.json', content: { title: 'Imported acceptance', textContent: 'Keep two', listContent: [{ text: 'pending', isChecked: false }] } },
    { name: 'trashed.json', content: { title: 'Trashed', textContent: 'skip', isTrashed: true } },
    { name: 'invalid.json', content: '{invalid json' }
  ]
  const imported = await command(context, 'runAddonAction', 'elephant.google-keep-import.import', documents)
  assert(imported.imported === 2 && imported.skipped === 1 && imported.failed === 1, 'Keep counts are incorrect', imported)
  const first = await command(context, 'readNote', 'Imported/Google Keep/Imported acceptance.md')
  const second = await command(context, 'readNote', 'Imported/Google Keep/Imported acceptance 2.md')
  assert(first.content.includes('Keep one') && first.content.includes('- [x] done') && first.content.includes('tags: ["qa"]'), 'First Keep conversion failed', first)
  assert(second.content.includes('Keep two') && second.content.includes('- [ ] pending'), 'Second Keep conversion failed', second)
  assert(!existsSync(join(context.vaultRoot, 'Imported', 'Google Keep', 'Trashed.md')), 'Trashed Keep note was imported')
  const duplicate = await command(context, 'runAddonAction', 'elephant.google-keep-import.import', [documents[0]])
  assert(duplicate.imported === 0 && duplicate.failed === 1, 'Keep duplicate protection failed', duplicate)
  return { imported, duplicate, created: relativeFiles(join(context.vaultRoot, 'Imported', 'Google Keep')) }
}

const wiki = async(context) => {
  writeFileSync(join(context.vaultRoot, 'Source A.md'), '# Source A\n\nAnatomy source #anatomy.\n')
  writeFileSync(join(context.vaultRoot, 'Source B.md'), '# Source B\n\nSecond anatomy source #anatomy.\n')
  const before = markdownDigest(context.vaultRoot)
  await installEnable(context, 'elephant.wiki')
  const generated = await command(context, 'invokeAddonResource', 'wiki.provider', 'generate')
  assert(Array.isArray(generated.records) && generated.engine, 'Wiki generate payload is invalid', generated)
  const proposed = await command(context, 'invokeAddonResource', 'wiki.provider', 'propose', 'Acceptance Anatomy', { title: 'Acceptance Anatomy', sourcePaths: ['Source A.md', 'Source B.md'] })
  const dismissed = await command(context, 'invokeAddonResource', 'wiki.provider', 'dismiss', proposed.id)
  assert(proposed.status === 'proposed' && dismissed.status === 'dismissed', 'Wiki propose/dismiss failed', { proposed, dismissed })
  const reproposed = await command(context, 'invokeAddonResource', 'wiki.provider', 'propose', 'Acceptance Anatomy', { title: 'Acceptance Anatomy', sourcePaths: ['Source A.md', 'Source B.md'] })
  const accepted = await command(context, 'invokeAddonResource', 'wiki.provider', 'accept', reproposed.id)
  const direct = await command(context, 'invokeAddonResource', 'wiki.provider', 'create', 'Direct API Wiki', { title: 'Direct API Wiki', markdown: '# Direct API Wiki\n\nCreated directly.\n\n[[Source A]]' })
  const search = await command(context, 'invokeAddonResource', 'wiki.provider', 'search', 'Direct API Wiki', { limit: 20 })
  assert(accepted.status === 'accepted' && String(accepted.path).startsWith('Wiki/'), 'Wiki accept failed', accepted)
  assert(direct.path === 'Wiki/direct-api-wiki.md' && search.some((entry) => String(entry.path).includes('direct-api-wiki.md')), 'Wiki create/search failed', { direct, search })
  const acceptedNote = await command(context, 'readNote', accepted.path)
  const directNote = await command(context, 'readNote', direct.path)
  assert(acceptedNote.content.includes('Acceptance Anatomy') && directNote.content.includes('Created directly'), 'Wiki disk content is incorrect', { acceptedNote, directNote })
  const after = markdownDigest(context.vaultRoot)
  const created = Object.keys(after).filter((path) => !(path in before))
  assert(created.length >= 2 && created.every((path) => path.startsWith('Wiki/')), 'Wiki wrote Markdown outside Wiki/**', created)
  return { generated: { engine: generated.engine, count: generated.generated }, proposed, dismissed, accepted, direct, searchCount: search.length, created }
}

const graph = async(context) => {
  for (let index = 1; index <= 205; index += 1) {
    const label = String(index).padStart(3, '0')
    const previous = index > 1 ? `[[Graph ${String(index - 1).padStart(3, '0')}]]` : '[[Acceptance]]'
    writeFileSync(join(context.vaultRoot, `Graph ${label}.md`), `# Graph ${label}\n\n${previous}\n\n#graph-shared\n`)
  }
  const before = markdownDigest(context.vaultRoot)
  await installEnable(context, 'elephant.graph')
  const value = await command(context, 'runAddonAction', 'elephant.graph.rebuild')
  assert(Array.isArray(value.nodes) && value.nodes.length >= 207, 'Graph silently capped or omitted notes', { nodes: value.nodes?.length })
  assert(value.nodes.some((node) => String(node.path || node.relativePath).endsWith('Graph 205.md')), 'Graph omitted note 205')
  assert(value.edges.some((edge) => edge.kind === 'link') && value.edges.some((edge) => edge.kind === 'tag'), 'Graph omitted link/tag edges', value.edges)
  await command(context, 'runAddonAction', 'elephant.graph.open')
  const svg = await command(context, 'waitFor', '.elephant-graph-svg', 20000)
  const domNodes = await command(context, 'readDomAll', '.elephant-graph-node')
  assert(svg.exists && domNodes.length === value.nodes.length, 'Graph SVG did not render every node', { dom: domNodes.length, graph: value.nodes.length })
  assert(JSON.stringify(markdownDigest(context.vaultRoot)) === JSON.stringify(before), 'Graph modified Markdown')
  return { nodes: value.nodes.length, edges: value.edges.length, rendered: domNodes.length, engine: value.engine || 'local-fallback' }
}

const knowledge = async(context) => {
  writeFileSync(join(context.vaultRoot, 'Anatomy.md'), '# Anatomy\n\nThorax abdomen pelvis anatomy #medical.\n\n[[Linked Note]]\n')
  await installEnable(context, 'elephant.knowledge')
  const native = await waitNative(context, 'elephant.knowledge', true)
  const before = await command(context, 'invokeAddonResource', 'knowledge.provider', 'status')
  const rebuild = await command(context, 'invokeAddonResource', 'knowledge.provider', 'rebuild')
  const after = await command(context, 'invokeAddonResource', 'knowledge.provider', 'status')
  const search = await command(context, 'invokeAddonResource', 'knowledge.provider', 'search', 'thorax abdomen pelvis', { limit: 20 })
  const inspect = await command(context, 'invokeAddonResource', 'knowledge.provider', 'inspect', 'Anatomy.md')
  const projection = await command(context, 'invokeAddonResource', 'knowledge.provider', 'graph', { includeSuggestions: true })
  assert(rebuild && !rebuild.error, 'Knowledge rebuild failed', rebuild)
  assert(search.some((entry) => JSON.stringify(entry).includes('Anatomy.md')), 'Knowledge search missed Anatomy.md', search)
  assert(JSON.stringify(inspect).includes('Anatomy'), 'Knowledge inspect is invalid', inspect)
  assert(Array.isArray(projection.nodes) && projection.nodes.length >= 2 && Array.isArray(projection.edges), 'Knowledge graph is invalid', projection)
  await command(context, 'disableAddon', 'elephant.knowledge')
  const stopped = await waitNative(context, 'elephant.knowledge', false)
  return { native, before, rebuild, after, searchCount: search.length, inspect, graph: { nodes: projection.nodes.length, edges: projection.edges.length }, stopped }
}

const openModels = async(context) => {
  await installEnable(context, 'elephant.ai')
  const original = await command(context, 'invokeAddonResource', 'ai.config', 'get')
  await installEnable(context, 'elephant.open-models')
  const native = await waitNative(context, 'elephant.open-models', true)
  const status = await command(context, 'invokeAddonResource', 'models.provider', 'status')
  const models = await command(context, 'invokeAddonResource', 'models.provider', 'list')
  const active = await command(context, 'invokeAddonResource', 'models.provider', 'active')
  const configured = await command(context, 'invokeAddonResource', 'ai.config', 'get')
  assert(status.running === true && status.owner === 'elephant.open-models' && String(status.modelsDirectory || '').trim(), 'Open Models status is invalid', status)
  assert(Array.isArray(models), 'Open Models list is invalid', models)
  assert(configured?.localAi?.enabled === true && configured.localAi.showModelLibraryInSidebar === true && configured.localAi.allowLocalRuntimeAutostart === true, 'Open Models did not configure local AI', configured)
  await command(context, 'disableAddon', 'elephant.open-models')
  const stopped = await waitNative(context, 'elephant.open-models', false)
  const disabled = await command(context, 'invokeAddonResource', 'ai.config', 'get')
  assert(disabled?.localAi?.enabled === false, 'Open Models disable did not disable local AI', disabled)
  await command(context, 'enableAddon', 'elephant.open-models')
  const restarted = await waitNative(context, 'elephant.open-models', true)
  const reconfigured = await command(context, 'invokeAddonResource', 'ai.config', 'get')
  assert(reconfigured?.localAi?.enabled === true, 'Open Models re-enable did not restore local AI', reconfigured)
  await command(context, 'disableAddon', 'elephant.open-models')
  await waitNative(context, 'elephant.open-models', false)
  await command(context, 'invokeAddonResource', 'ai.config', 'set', original)
  const restored = await command(context, 'invokeAddonResource', 'ai.config', 'get')
  assert(JSON.stringify(restored) === JSON.stringify(original), 'AI config was not restored', { original, restored })
  return { native, status, models: models.length, active, configured, stopped, disabled, restarted, restored }
}

const scenarios = { dashboard, 'recently-edited': recentlyEdited, calendar, 'google-keep': googleKeep, wiki, graph, knowledge, 'open-models': openModels }
const context = createFixture(scenarioId)
const startedAt = new Date().toISOString()
let result
try {
  assert(scenarios[scenarioId], `Unknown focused addon scenario: ${scenarioId}`)
  await startApplication(context)
  await ensureVault(context)
  const functional = await scenarios[scenarioId](context)
  result = { scenarioId, status: 'PASS', evidenceLevel: 'packaged-functional-independent', startedAt, finishedAt: new Date().toISOString(), commit: process.env.ELEPHANT_TEST_COMMIT || process.env.GITHUB_SHA || null, appPath, functional }
} catch (error) {
  result = { scenarioId, status: 'FAIL', evidenceLevel: 'packaged-functional-independent', startedAt, finishedAt: new Date().toISOString(), commit: process.env.ELEPHANT_TEST_COMMIT || process.env.GITHUB_SHA || null, appPath, error: error instanceof Error ? error.message : String(error), details: error?.details || null, stack: error instanceof Error ? error.stack : null, logTail: context.output.slice(-30000) }
} finally {
  await cleanup(context)
}
writeResult(scenarioId, result)
console.log(`[focused-addon] result ${JSON.stringify({ scenarioId, status: result.status, error: result.error || null })}`)
if (result.status !== 'PASS') process.exitCode = 1
