#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../..')
const artifactRoot = join(root, 'test-results', 'addon-independent')
const defaultAddons = [
  'elephant.dashboard',
  'elephant.recently-edited',
  'elephant.calendar',
  'elephant.google-keep-import'
]
const selectedAddons = String(process.env.ELEPHANT_ADDON_MATRIX || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const addonIds = selectedAddons.length ? selectedAddons : defaultAddons
const originalHome = process.env.HOME || '/tmp'
const appPath = process.env.ELEPHANT_ACCEPTANCE_APP_PATH || './build/scripts/build_dev.sh'

mkdirSync(artifactRoot, { recursive: true })
if (process.env.ELEPHANT_ACCEPTANCE_SKIP_BUILD !== '1') {
  console.log('[addon-independent] building the current Tauri renderer')
  execFileSync('pnpm', ['tauri:web:build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELEPHANT_ACCEPTANCE_BUILD: '1' }
  })
}

const assert = (condition, message, details = null) => {
  if (!condition) {
    const error = new Error(message)
    if (details !== null) error.details = details
    throw error
  }
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const walkFiles = (directory) => {
  if (!existsSync(directory)) return []
  const files = []
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name)
    const info = statSync(absolute)
    if (info.isDirectory()) files.push(...walkFiles(absolute))
    else files.push(absolute)
  }
  return files
}

const relativeFiles = (directory) => walkFiles(directory)
  .map((absolute) => relative(directory, absolute).replaceAll('\\', '/'))
  .sort()

const markdownDigest = (directory) => {
  const result = {}
  for (const absolute of walkFiles(directory)) {
    const path = relative(directory, absolute).replaceAll('\\', '/')
    if (!path.toLowerCase().endsWith('.md')) continue
    result[path] = createHash('sha256').update(readFileSync(absolute)).digest('hex')
  }
  return result
}

const createFixture = (addonId) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `elephant-addon-${addonId.replaceAll('.', '-')}-`))
  const vaultRoot = join(fixtureRoot, 'vault')
  const configRoot = join(fixtureRoot, 'config')
  mkdirSync(join(vaultRoot, '.elephantnote'), { recursive: true })
  mkdirSync(configRoot, { recursive: true })
  writeFileSync(join(vaultRoot, '.elephantnote', 'workspace.json'), JSON.stringify({ version: 1, vaultName: addonId, sidebar: [] }))
  writeFileSync(join(configRoot, 'elephantnote.json'), JSON.stringify({ vaults: [], activeVaultId: null }))
  writeFileSync(join(vaultRoot, 'Acceptance.md'), '# Acceptance\n\nIndependent addon fixture.\n', 'utf8')
  for (let index = 1; index <= 8; index += 1) {
    const label = String(index).padStart(2, '0')
    writeFileSync(join(vaultRoot, `Recent ${label}.md`), `# Recent ${label}\n\nFixture ${label}.\n`, 'utf8')
  }
  return { addonId, fixtureRoot, vaultRoot, configRoot, child: null, endpoint: '', output: '' }
}

const collect = (context, prefix, chunk) => {
  const text = chunk.toString()
  context.output += text
  process.stdout.write(`[${context.addonId}]${prefix}${text}`)
}

const startApplication = async(context) => {
  const outputOffset = context.output.length
  const { ELEPHANT_E2E_VAULT_ROOT: _ignoredE2EVaultRoot, ...cleanEnv } = process.env
  context.child = spawn(appPath, [], {
    cwd: root,
    env: {
      ...cleanEnv,
      HOME: context.fixtureRoot,
      PNPM_HOME: process.env.PNPM_HOME || `${originalHome}/.local/share/pnpm`,
      RUSTUP_HOME: process.env.RUSTUP_HOME || `${originalHome}/.rustup`,
      CARGO_HOME: process.env.CARGO_HOME || `${originalHome}/.cargo`,
      ELEPHANTNOTE_CONFIG_DIR: context.configRoot,
      ELEPHANT_ACCEPTANCE_TAURI_PORT: '0'
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  context.child.stdout.on('data', (chunk) => collect(context, ' ', chunk))
  context.child.stderr.on('data', (chunk) => collect(context, ':error ', chunk))

  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const match = context.output.slice(outputOffset).match(/ELEPHANT_ACCEPTANCE_TAURI_PORT=(\d+)/)
    if (match) {
      context.endpoint = `http://127.0.0.1:${Number(match[1])}`
      return
    }
    if (context.child.exitCode !== null) {
      throw new Error(`Tauri exited before the acceptance server started (${context.child.exitCode})`)
    }
    await sleep(250)
  }
  throw new Error('Timed out waiting for the Tauri acceptance server')
}

const stopApplication = async(context) => {
  const child = context.child
  context.child = null
  context.endpoint = ''
  if (!child || child.exitCode !== null) return
  await new Promise((resolvePromise) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      resolvePromise()
    }
    child.once('close', finish)
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
    setTimeout(finish, 5000)
  })
}

const command = async(context, commandName, ...args) => {
  const response = await fetch(`${context.endpoint}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: commandName, args })
  })
  const body = await response.json()
  console.log(`[addon-independent] ${context.addonId} ${commandName} ${response.ok && body.ok ? 'ok' : 'failed'}`)
  if (!response.ok || !body.ok) throw new Error(`${commandName} failed: ${body.error || response.status}`)
  return body.result
}

const bootstrapAddon = async(context) => {
  const health = await fetch(`${context.endpoint}/health`).then((response) => response.json())
  assert(health.transport === 'tauri', 'Acceptance transport is not Tauri', health)
  const emptyVault = await command(context, 'readDom', '.en-empty-card')
  assert(emptyVault.exists && emptyVault.text.includes('Choose your first vault'), 'First-run vault picker is not visible', emptyVault)
  await command(context, 'selectVault', context.vaultRoot)

  if (context.addonId === 'elephant.recently-edited') {
    for (let index = 1; index <= 8; index += 1) {
      const label = String(index).padStart(2, '0')
      await command(context, 'openNote', `Recent ${label}.md`)
    }
  }

  const installed = await command(context, 'installOfficialAddon', context.addonId)
  const enabled = await command(context, 'enableAddon', context.addonId)
  const state = await command(context, 'addonState')
  const addon = state.addons.find((entry) => entry.id === context.addonId)
  assert(addon, 'Installed addon is absent from addonState', state)
  assert(addon.enabled === true && !addon.error, 'Addon did not enable cleanly', addon)
  return { installed, enabled, addon, actionCount: state.actions.length, resourceCount: state.resources.length }
}

const runDashboard = async(context) => {
  const before = markdownDigest(context.vaultRoot)
  const action = await command(context, 'runAddonAction', 'elephant.dashboard.open')
  const dashboard = await command(context, 'readNote', '.elephantnote/Dashboard.md')
  const state = await command(context, 'readState')
  assert(typeof dashboard.content === 'string' && dashboard.content.includes('Dashboard'), 'Dashboard note was not generated', dashboard)
  assert(state.notePath?.endsWith('.elephantnote/Dashboard.md'), 'Dashboard action did not open the generated note', state)
  assert(existsSync(join(context.vaultRoot, '.elephantnote', 'Dashboard.md')), 'Dashboard file is absent on disk')
  assert(readFileSync(join(context.vaultRoot, '.elephantnote', 'Dashboard.md'), 'utf8') === dashboard.content, 'Dashboard UI and disk content differ')

  await command(context, 'runAddonAction', 'elephant.dashboard.open')
  const second = await command(context, 'readNote', '.elephantnote/Dashboard.md')
  assert(second.content.includes('Dashboard'), 'Dashboard refresh corrupted its own note', second)

  const after = markdownDigest(context.vaultRoot)
  const newMarkdown = Object.keys(after).filter((path) => !(path in before))
  const modifiedExisting = Object.keys(before).filter((path) => after[path] !== before[path])
  assert(newMarkdown.length === 1 && newMarkdown[0] === '.elephantnote/Dashboard.md', 'Dashboard created unexpected Markdown files', { before, after, newMarkdown })
  assert(modifiedExisting.length === 0, 'Dashboard modified existing Markdown files', { modifiedExisting, before, after })
  return { action, path: dashboard.path, bytes: Buffer.byteLength(dashboard.content), newMarkdown }
}

const runRecentlyEdited = async(context) => {
  const before = markdownDigest(context.vaultRoot)
  const rootNode = await command(context, 'waitFor', '.elephant-recent-notes', 10000)
  const initial = await command(context, 'readDom', '.elephant-recent-list')
  assert(rootNode.exists && initial.exists, 'Recently edited section did not render', { rootNode, initial })
  for (const label of ['Recent 08', 'Recent 07', 'Recent 06', 'Recent 05', 'Recent 04']) {
    assert(initial.text.includes(label), `Initial recently-edited list is missing ${label}`, initial)
  }
  assert(!initial.text.includes('Recent 03'), 'Initial recently-edited list exposes more than five notes', initial)
  await command(context, 'click', '.elephant-recent-more')
  const expanded = await command(context, 'readDom', '.elephant-recent-list')
  assert(expanded.text.includes('Recent 01') && expanded.text.includes('Recent 08'), 'Show more did not expose all recent notes', expanded)
  await command(context, 'click', '.elephant-recent-heading')
  const collapsed = await command(context, 'readDom', '.elephant-recent-list')
  assert(collapsed.visible === false || collapsed.attributes?.hidden !== undefined, 'Recently edited section did not collapse', collapsed)
  const after = markdownDigest(context.vaultRoot)
  assert(JSON.stringify(after) === JSON.stringify(before), 'Recently edited changed Markdown files', { before, after })
  return { initialText: initial.text, expandedText: expanded.text, collapsedVisible: collapsed.visible }
}

const calendarIcs = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:independent-calendar-event\nSUMMARY:Independent calendar event\nDTSTART:20260806T100000Z\nDTEND:20260806T110000Z\nLOCATION:Acceptance room\nDESCRIPTION:Persistent addon event\nEND:VEVENT\nEND:VCALENDAR`

const runCalendar = async(context) => {
  const before = markdownDigest(context.vaultRoot)
  await command(context, 'runAddonAction', 'elephant.calendar.open')
  const panel = await command(context, 'waitFor', '.elephant-calendar-package', 10000)
  assert(panel.exists, 'Calendar panel did not render', panel)
  const imported = await command(context, 'invokeAddonResource', 'calendar.provider', 'importIcs', calendarIcs, 'independent.ics')
  assert(imported.imported === 1 && imported.total === 1, 'Calendar did not import exactly one event', imported)
  const listed = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(Array.isArray(listed) && listed.length === 1 && listed[0].title === 'Independent calendar event', 'Calendar list is incorrect', listed)
  await command(context, 'runAddonAction', 'elephant.calendar.open')
  const rendered = await command(context, 'waitFor', '.elephant-calendar-event', 10000)
  assert(rendered.text.includes('Independent calendar event'), 'Imported calendar event is not visible', rendered)

  await stopApplication(context)
  await startApplication(context)
  await command(context, 'selectVault', context.vaultRoot)
  const persistedState = await command(context, 'addonState')
  const persistedAddon = persistedState.addons.find((entry) => entry.id === context.addonId)
  assert(persistedAddon?.enabled === true && !persistedAddon.error, 'Calendar addon did not remain enabled after restart', persistedAddon)
  const persisted = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(persisted.length === 1 && persisted[0].id === 'independent-calendar-event', 'Calendar events did not persist after restart', persisted)
  const cleared = await command(context, 'invokeAddonResource', 'calendar.provider', 'clear')
  assert(Array.isArray(cleared) && cleared.length === 0, 'Calendar clear returned an invalid result', cleared)
  const afterClear = await command(context, 'invokeAddonResource', 'calendar.provider', 'list')
  assert(afterClear.length === 0, 'Calendar clear did not remove events', afterClear)
  const after = markdownDigest(context.vaultRoot)
  assert(JSON.stringify(after) === JSON.stringify(before), 'Calendar modified Markdown files', { before, after })
  return { imported, persisted, cleared: true, vaultMarkdownUnchanged: true }
}

const runGoogleKeepImport = async(context) => {
  const documents = [
    {
      name: 'acceptance-one.json',
      content: {
        title: 'Imported acceptance',
        textContent: 'Google Keep round trip one',
        labels: [{ name: 'qa' }],
        listContent: [{ text: 'done', isChecked: true }]
      }
    },
    {
      name: 'acceptance-two.json',
      content: {
        title: 'Imported acceptance',
        textContent: 'Google Keep round trip two',
        listContent: [{ text: 'pending', isChecked: false }]
      }
    },
    {
      name: 'trashed.json',
      content: { title: 'Trashed acceptance', textContent: 'must be skipped', isTrashed: true }
    },
    { name: 'invalid.json', content: '{not valid json' }
  ]
  const imported = await command(context, 'runAddonAction', 'elephant.google-keep-import.import', documents)
  assert(imported.imported === 2 && imported.skipped === 1 && imported.failed === 1, 'Google Keep import counts are incorrect', imported)
  const first = await command(context, 'readNote', 'Imported/Google Keep/Imported acceptance.md')
  const second = await command(context, 'readNote', 'Imported/Google Keep/Imported acceptance 2.md')
  assert(first.content.includes('Google Keep round trip one') && first.content.includes('- [x] done') && first.content.includes('tags: ["qa"]'), 'First Keep note conversion is incorrect', first)
  assert(second.content.includes('Google Keep round trip two') && second.content.includes('- [ ] pending'), 'Second Keep note conversion is incorrect', second)
  assert(!existsSync(join(context.vaultRoot, 'Imported', 'Google Keep', 'Trashed acceptance.md')), 'Trashed Keep note was imported unexpectedly')

  const duplicateAttempt = await command(context, 'runAddonAction', 'elephant.google-keep-import.import', [documents[0]])
  assert(duplicateAttempt.imported === 0 && duplicateAttempt.failed === 1, 'Keep import overwrote an existing note instead of refusing', duplicateAttempt)
  const diskFirst = readFileSync(join(context.vaultRoot, 'Imported', 'Google Keep', 'Imported acceptance.md'), 'utf8')
  assert(diskFirst === first.content, 'Keep import UI and disk content differ')
  return {
    imported,
    duplicateAttempt,
    created: relativeFiles(join(context.vaultRoot, 'Imported', 'Google Keep'))
  }
}

const scenarioByAddon = {
  'elephant.dashboard': runDashboard,
  'elephant.recently-edited': runRecentlyEdited,
  'elephant.calendar': runCalendar,
  'elephant.google-keep-import': runGoogleKeepImport
}

const runOne = async(addonId) => {
  const context = createFixture(addonId)
  const startedAt = new Date().toISOString()
  let result
  try {
    assert(scenarioByAddon[addonId], `No independent scenario is implemented for ${addonId}`)
    await startApplication(context)
    const lifecycle = await bootstrapAddon(context)
    const functional = await scenarioByAddon[addonId](context)
    result = {
      addonId,
      status: 'PASS',
      evidenceLevel: 'packaged-functional-independent',
      startedAt,
      finishedAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || null,
      appPath,
      lifecycle,
      functional
    }
  } catch (error) {
    result = {
      addonId,
      status: 'FAIL',
      evidenceLevel: 'packaged-functional-independent',
      startedAt,
      finishedAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || null,
      appPath,
      error: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
      stack: error instanceof Error ? error.stack : null,
      logTail: context.output.slice(-20000)
    }
  } finally {
    await stopApplication(context)
    rmSync(context.fixtureRoot, { recursive: true, force: true })
  }
  writeFileSync(join(artifactRoot, `${addonId}.json`), JSON.stringify(result, null, 2))
  return result
}

const results = []
for (const addonId of addonIds) results.push(await runOne(addonId))
const summary = {
  status: results.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
  evidenceLevel: 'packaged-functional-independent',
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || null,
  addons: results.map(({ addonId, status, error = null }) => ({ addonId, status, error }))
}
writeFileSync(join(artifactRoot, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(`[addon-independent] summary ${JSON.stringify(summary)}`)
if (summary.status !== 'PASS') process.exitCode = 1
