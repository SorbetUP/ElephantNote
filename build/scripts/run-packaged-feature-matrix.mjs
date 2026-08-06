#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createRealAppHarness } from './lib/real-app-harness.mjs'

const R = resolve(import.meta.dirname, '../..')
const M = JSON.parse(readFileSync(join(R, 'tests/trust/packaged-feature-matrix.json')))
const O = join(R, 'test-results/trusted/packaged-feature-matrix')
const L = 'user-journey'
const E = '[data-testid="muya-rust-runtime-editor"]'
const I = `${E}[contenteditable="true"], ${E} [contenteditable="true"]`
const APP_PATH = resolve(process.env.ELEPHANT_ACCEPTANCE_APP_PATH || '')
const appSha256 = process.env.ELEPHANT_ACCEPTANCE_APP_SHA256 || createHash('sha256')
  .update(readFileSync(APP_PATH))
  .digest('hex')
const out = []

mkdirSync(O, { recursive: true })
const z = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const ok = (condition, message) => { if (!condition) throw new Error(message) }
const act = (h, name, ...args) => h.action(L, name, ...args)
const set = (h, name, ...args) => h.setup(name, ...args)

async function state(h, predicate, name) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const value = await act(h, 'readState')
    if (predicate(value)) return value
    await z(50)
  }
  throw new Error(`${name}: state timeout`)
}

async function dom(h, selector, predicate, name) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const value = await act(h, 'readDom', selector)
    if (predicate(value)) return value
    await z(50)
  }
  throw new Error(`${name}: DOM timeout`)
}

async function absent(h, selector, name) {
  return dom(h, selector, (value) => !value.exists, name)
}

async function prepareVault(h) {
  await set(h, 'selectVault', h.vaultRoot)
  await act(h, 'waitFor', '.en-library-toolbar', 20_000)
}

async function open(h, path = 'Feature.md') {
  await prepareVault(h)
  await set(h, 'openNote', path)
  await act(h, 'waitFor', I, 20_000)
}

async function editEnd(h, text) {
  const editor = await act(h, 'readDom', I)
  await act(h, 'selectText', I, editor.text.length, editor.text.length)
  await act(h, 'insertText', I, text)
}

async function search(h, query, expected) {
  await act(h, 'click', '.en-rail-icon[aria-label="Search"]')
  await act(h, 'waitFor', '.en-search-bar-input', 20_000)
  await act(h, 'fill', '.en-search-bar-input', query)
  await act(h, 'press', '.en-search-bar-input', 'Enter')
  const result = await dom(h, '.en-search-results', (value) => value.visible && value.text.includes(expected), 'search')
  await act(h, 'press', '.en-search-bar-input', 'Escape')
  await act(h, 'press', '.en-search-bar-input', 'Escape')
  return result
}

async function openHistory(h, predicate, name) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const history = await set(h, 'readFileOpenHistory')
    const entry = history.findLast?.(predicate) || [...history].reverse().find(predicate)
    if (entry) return entry
    await z(50)
  }
  throw new Error(`${name}: file-open history timeout`)
}

async function waitForNewEntry(root, previous, predicate, name) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const entries = readdirSync(root)
    const added = entries.find((entry) => !previous.has(entry) && predicate(entry))
    if (added) return added
    await z(50)
  }
  throw new Error(`${name}: no new disk entry appeared`)
}

const F = {
  'app-launch': async (h) => {
    const firstScreen = await act(h, 'readDom', '.en-empty-card')
    ok(firstScreen.visible && firstScreen.text.includes('Choose your first vault'), 'first screen')
    return firstScreen
  },

  'vault-selection': async (h) => {
    const firstScreen = await act(h, 'readDom', '.en-empty-card')
    ok(firstScreen.visible, 'vault onboarding is not visible')
    await act(h, 'click', '.en-primary-button')
    const current = await state(h, (value) => typeof value.activeVault === 'string' && value.activeVault.length > 0, 'visible private vault')
    ok(existsSync(current.activeVault) && statSync(current.activeVault).isDirectory(), 'managed private vault was not created on disk')
    await act(h, 'waitFor', '.en-library-toolbar', 20_000)
    return { activeVault: current.activeVault, visibleControl: '.en-primary-button' }
  },

  'create-note': async (h) => {
    await prepareVault(h)
    const previous = new Set(readdirSync(h.vaultRoot))
    await act(h, 'click', '.en-create-button-primary')
    const filename = await waitForNewEntry(h.vaultRoot, previous, (entry) => entry.endsWith('.md'), 'visible note creation')
    await act(h, 'waitFor', E, 20_000)
    const current = await state(h, (value) => String(value.pathname || '').endsWith(filename), 'created note opened')
    ok(existsSync(join(h.vaultRoot, filename)), 'created note absent on disk')
    return { filename, pathname: current.pathname, visibleControl: '.en-create-button-primary' }
  },

  'create-folder': async (h) => {
    await prepareVault(h)
    const previous = new Set(readdirSync(h.vaultRoot))
    await act(h, 'click', '.en-create-button:not(.en-create-button-primary):not(.en-create-excalidraw-button)')
    const filename = await waitForNewEntry(
      h.vaultRoot,
      previous,
      (entry) => statSync(join(h.vaultRoot, entry)).isDirectory(),
      'visible folder creation'
    )
    const path = join(h.vaultRoot, filename)
    ok(existsSync(path) && statSync(path).isDirectory(), 'folder absent')
    return { filename, path, visibleControl: '.en-create-button' }
  },

  'external-note-refresh': async (h) => {
    await prepareVault(h)
    writeFileSync(join(h.vaultRoot, 'External.md'), '# External\n\nexternal-marker\n')
    const result = await search(h, 'external-marker', 'External')
    await set(h, 'openNote', 'External.md')
    ok((await act(h, 'readState')).markdown.includes('external-marker'), 'external note unreadable')
    return result
  },

  'external-folder-refresh': async (h) => {
    await prepareVault(h)
    mkdirSync(join(h.vaultRoot, 'External folder'))
    writeFileSync(join(h.vaultRoot, 'External folder/Nested.md'), '# Nested\n\nfolder-marker\n')
    const result = await search(h, 'folder-marker', 'Nested')
    await set(h, 'openNote', 'External folder/Nested.md')
    return result
  },

  'note-visible-edit': async (h) => {
    await open(h)
    await editEnd(h, ' visible-marker')
    const current = await state(h, (value) => value.markdown.includes('visible-marker'), 'edit')
    ok((await act(h, 'readDom', E)).text.includes('visible-marker'), 'not visible')
    return current
  },

  'note-realtime-autosave': async (h) => {
    await open(h)
    await editEnd(h, ' autosave-marker')
    const canonical = await state(h, (value) => value.markdown.includes('autosave-marker'), 'canonical')
    const beforeDisk = h.readVaultFile('Feature.md')
    const disk = await h.waitForVaultFile('Feature.md', (value) => value.includes('autosave-marker'), 20_000)
    const saved = await state(h, (value) => value.isSaved === true && value.markdown.includes('autosave-marker'), 'saved')
    ok(beforeDisk.includes('autosave-marker') || canonical.isSaved === false, 'saved lied')
    return { bytes: disk.length, saved: saved.isSaved }
  },

  'note-read-stability': async (h) => {
    await open(h, 'Long.md')
    for (let index = 0; index < 30; index += 1) {
      const current = await act(h, 'readState')
      const editor = await act(h, 'readDom', E)
      ok(editor.visible && current.markdown.includes('line-199'), `read ${index}`)
    }
    return { reads: 30 }
  },

  'excalidraw-open-close': async (h) => {
    await prepareVault(h)
    await act(h, 'click', '.en-create-excalidraw-button')
    const opened = await dom(h, '[data-testid="excalidraw-dialog"]', (value) => value.visible, 'visible Excalidraw open')
    const canvas = await dom(h, '.en-excalidraw-canvas', (value) => value.visible, 'Excalidraw canvas')
    ok(!opened.text.includes('failed') && canvas.visible, 'Excalidraw opened with an error')
    await act(h, 'click', '[data-testid="excalidraw-close"]')
    await absent(h, '[data-testid="excalidraw-dialog"]', 'visible Excalidraw close')
    return { opened: true, canvas: true, closed: true }
  },

  'text-basic-editing': async (h) => {
    await open(h)
    const paragraph = `${E} .ag-paragraph-content`
    const content = await act(h, 'readDom', paragraph)
    await act(h, 'selectText', paragraph, 0, content.text.length)
    await act(h, 'insertText', I, 'Simple line')
    await act(h, 'press', I, 'Enter')
    await act(h, 'insertText', I, 'Second line')
    return state(h, (value) => value.markdown.includes('Simple line') && value.markdown.includes('Second line'), 'text')
  },

  'markdown-live-formatting': async (h) => {
    await open(h, 'Formatting.md')
    const paragraph = `${E} .ag-paragraph-content`
    const content = await act(h, 'readDom', paragraph)
    await act(h, 'selectText', paragraph, 0, content.text.length)
    await act(h, 'insertText', I, '**bold** and *italic* and `code`')
    const current = await state(h, (value) => value.markdown.includes('**bold**'), 'markdown')
    const visible = await dom(h, E, (value) => value.html.includes('<strong') && value.html.includes('<em'), 'render')
    return { current, htmlLength: visible.html.length }
  },

  'settings-roundtrip': async (h) => {
    await open(h)
    await act(h, 'click', '[aria-label="Settings"]')
    await act(h, 'waitFor', '.en-settings-panel', 20_000)
    await act(h, 'fill', '[aria-label="Search all settings"]', 'autosave')
    const searchResult = await dom(h, '.en-settings-search-results', (value) => value.visible && value.text.includes('Autosave'), 'settings')
    await act(h, 'fill', '[aria-label="Search all settings"]', '')
    await act(h, 'click', '.en-settings-nav button:first-child')
    const before = await act(h, 'readDom', '.en-shell')
    const dark = before.attributes.class?.includes('en-theme-dark')
    const target = dark ? '.en-segmented button:nth-child(1)' : '.en-segmented button:nth-child(2)'
    await act(h, 'click', target)
    const changed = await dom(h, '.en-shell', (value) => (value.attributes.class?.includes('en-theme-dark')) !== dark, 'theme')
    return { search: searchResult.text, dark, changed: changed.attributes.class }
  },

  'sidebar-hide-full-button': async (h) => {
    await open(h)
    const before = await act(h, 'readDom', '.en-body')
    const hidden = before.attributes.class?.includes('en-sidebar-hidden')
    await act(h, 'click', '.en-rail-sidebar-toggle')
    await dom(h, '.en-body', (value) => (value.attributes.class?.includes('en-sidebar-hidden')) !== hidden, 'hide')
    await act(h, 'click', '.en-rail-sidebar-toggle')
    return dom(h, '.en-body', (value) => (value.attributes.class?.includes('en-sidebar-hidden')) === hidden, 'show')
  },

  'sidebar-hide-full-shortcut': async (h) => {
    await open(h)
    const before = await act(h, 'readDom', '.en-body')
    const hidden = before.attributes.class?.includes('en-sidebar-hidden')
    await set(h, 'pressShortcut', I, 'j', { ctrlKey: true, code: 'KeyJ' })
    await dom(h, '.en-body', (value) => (value.attributes.class?.includes('en-sidebar-hidden')) !== hidden, 'shortcut hide')
    await set(h, 'pressShortcut', I, 'j', { ctrlKey: true, code: 'KeyJ' })
    return dom(h, '.en-body', (value) => (value.attributes.class?.includes('en-sidebar-hidden')) === hidden, 'shortcut show')
  },

  'drop-file-into-vault-folder': async (h) => {
    await prepareVault(h)
    await set(h, 'createFolder', 'Drop target')
    await set(h, 'dropFiles', '.folder-name[title="Drop target"], .en-sidebar', [
      { name: 'drop.txt', type: 'text/plain', content: 'drop-marker' }
    ])
    const path = join(h.vaultRoot, 'Drop target/drop.txt')
    for (let attempt = 0; attempt < 200 && !existsSync(path); attempt += 1) await z(100)
    ok(existsSync(path), 'drop folder failed')
    ok(readFileSync(path, 'utf8') === 'drop-marker', 'drop folder bytes differ')
    return { path }
  },

  'drop-image-into-note': async (h) => {
    await open(h)
    await editEnd(h, '')
    await set(h, 'dropFiles', I, [{
      name: 'drop.png',
      type: 'image/png',
      contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZoeV+QAAAAASUVORK5CYII='
    }])
    const current = await state(h, (value) => /drop\.png|!\[/.test(value.markdown), 'image drop')
    ok(existsSync(join(h.vaultRoot, '.assets')), 'asset dir absent')
    await dom(h, `${E} img`, (value) => value.visible, 'image visible')
    return current
  },

  'drop-file-link-into-note': async (h) => {
    await open(h)
    await set(h, 'clearFileOpenHistory')
    await set(h, 'dropFiles', I, [{ name: 'linked.txt', type: 'text/plain', content: 'linked' }])
    const saved = await state(h, (value) => /\[linked\.txt\]\([^)]+\)/i.test(value.markdown), 'linked file markdown')
    const assetPath = join(h.vaultRoot, '.assets', 'linked.txt')
    for (let attempt = 0; attempt < 200 && !existsSync(assetPath); attempt += 1) await z(50)
    ok(existsSync(assetPath) && readFileSync(assetPath, 'utf8') === 'linked', 'linked attachment bytes differ')
    const link = await dom(h, `${E} a`, (value) => value.exists && /linked\.txt/i.test(value.text + (value.attributes.href || '')), 'linked file visible link')
    return { saved, link, assetPath }
  },

  'pdf-addon-open-route': async (h) => {
    await open(h)
    await set(h, 'clearFileOpenHistory')
    await set(h, 'installPdfViewerProbe')
    try {
      await set(h, 'dropFiles', I, [{
        name: 'addon-route.pdf',
        type: 'application/pdf',
        content: '%PDF-1.4\naddon-route\n%%EOF\n'
      }])
      await state(h, (value) => /\[addon-route\.pdf\]\([^)]+\)/i.test(value.markdown), 'PDF addon markdown')
      await dom(h, `${E} a`, (value) => value.exists && /addon-route\.pdf/i.test(value.text + (value.attributes.href || '')), 'PDF addon visible link')
      await act(h, 'click', `${E} a`)
      const routed = await openHistory(h, (entry) => entry.route === 'pdf-addon', 'PDF addon route')
      ok(routed.handled === true && !routed.error, `wrong PDF addon route: ${JSON.stringify(routed)}`)
      return { routed }
    } finally {
      await set(h, 'removePdfViewerProbe')
    }
  },

  'pdf-system-open-fallback': async (h) => {
    await open(h)
    await set(h, 'clearFileOpenHistory')
    await set(h, 'removePdfViewerProbe')
    await set(h, 'dropFiles', I, [{
      name: 'system-route.pdf',
      type: 'application/pdf',
      content: '%PDF-1.4\nsystem-route\n%%EOF\n'
    }])
    await state(h, (value) => /\[system-route\.pdf\]\([^)]+\)/i.test(value.markdown), 'PDF system markdown')
    await dom(h, `${E} a`, (value) => value.exists && /system-route\.pdf/i.test(value.text + (value.attributes.href || '')), 'PDF system visible link')
    await act(h, 'click', `${E} a`)
    const routed = await openHistory(h, (entry) => entry.route === 'system-path', 'PDF system route')
    ok(routed.handled === true && !routed.error, `system PDF opener failed: ${routed.error}`)
    return { routed }
  }
}

async function run(id) {
  const h = createRealAppHarness({
    suite: `packaged-feature-${id}`,
    requirePackagedApp: true,
    initialFiles: {
      'Feature.md': '# Feature\n\nInitial text.\n',
      'Formatting.md': '# Formatting\n\nplain\n',
      'Long.md': `# Long\n\n${Array.from({ length: 200 }, (_, index) => `line-${index}`).join('\n')}`
    }
  })
  let e = null
  let evidence = null
  const startedAt = Date.now()
  try {
    await h.start()
    evidence = await F[id](h)
    await h.writeEvidence({ status: 'PROVEN', extra: { featureId: id, appSha256, evidence } })
  } catch (error) {
    e = error
    await h.writeEvidence({ status: 'NOT PROVEN', error, extra: { featureId: id, appSha256 } })
  } finally {
    await h.cleanup()
  }

  out.push({
    id,
    ok: !e,
    status: e ? 'NOT PROVEN' : 'PROVEN',
    durationMs: Date.now() - startedAt,
    appSha256,
    artifact: `test-results/trusted/packaged-feature-${id}/latest.json`,
    evidence,
    error: e ? (e.stack || e.message || String(e)) : null
  })
  console.log(`[matrix] ${e ? 'NOT PROVEN' : 'PROVEN'} ${id}`)
}

for (const id of M.requiredFeatures) {
  await run(id)
}

const missing = M.requiredFeatures.filter((id) => !out.some((entry) => entry.id === id && entry.ok))
const result = {
  at: new Date().toISOString(),
  status: missing.length ? 'NOT PROVEN' : 'PROVEN',
  packagedApp: true,
  packagedFormat: process.env.ELEPHANT_PACKAGED_FORMAT || null,
  appPath: process.env.ELEPHANT_ACCEPTANCE_APP_PATH || null,
  appSha256,
  features: out,
  missing
}
writeFileSync(join(O, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`[matrix] ${result.status} ${out.length - missing.length}/${out.length}`)
if (missing.length) process.exit(1)
