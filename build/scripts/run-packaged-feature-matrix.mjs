#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
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

async function open(h, path = 'Feature.md') {
  await set(h, 'selectVault', h.vaultRoot)
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

async function dropFileLink(h, descriptor) {
  await open(h)
  await set(h, 'clearFileOpenHistory')
  await set(h, 'dropFiles', I, [descriptor])
  const saved = await state(
    h,
    (value) => new RegExp(`\\[[^\\]]*${descriptor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\([^)]+\\)`, 'i').test(value.markdown),
    `drop ${descriptor.name}`
  )
  const assetPath = join(h.vaultRoot, '.assets', descriptor.name)
  for (let attempt = 0; attempt < 200 && !existsSync(assetPath); attempt += 1) await z(50)
  ok(existsSync(assetPath), `${descriptor.name} was not copied into .assets`)
  const link = await dom(
    h,
    `${E} a`,
    (value) => value.exists && new RegExp(descriptor.name, 'i').test(value.text + (value.attributes.href || '')),
    `${descriptor.name} visible link`
  )
  await act(h, 'click', `${E} a`)
  return { saved, link, assetPath }
}

const F = {
  'app-launch': async (h) => {
    const firstScreen = await act(h, 'readDom', '.en-empty-card')
    ok(firstScreen.visible && firstScreen.text.includes('Choose your first vault'), 'first screen')
    return firstScreen
  },

  'vault-selection': async (h) => {
    await set(h, 'selectVault', h.vaultRoot)
    const current = await act(h, 'readState')
    ok(current.activeVault === h.vaultRoot, 'vault mismatch')
    return current
  },

  'create-note': async (h) => {
    await set(h, 'selectVault', h.vaultRoot)
    await set(h, 'createNote', '', 'Created.md')
    ok(existsSync(join(h.vaultRoot, 'Created.md')), 'note absent')
    await set(h, 'openNote', 'Created.md')
    return act(h, 'waitFor', E, 20_000)
  },

  'create-folder': async (h) => {
    await set(h, 'selectVault', h.vaultRoot)
    await set(h, 'createFolder', 'Created folder')
    const path = join(h.vaultRoot, 'Created folder')
    ok(existsSync(path) && statSync(path).isDirectory(), 'folder absent')
    return set(h, 'invokeTauri', 'tauri_directory_list', {
      relativePath: '',
      offset: 0,
      limit: 500,
      includePreview: false
    })
  },

  'external-note-refresh': async (h) => {
    await set(h, 'selectVault', h.vaultRoot)
    writeFileSync(join(h.vaultRoot, 'External.md'), '# External\n\nexternal-marker\n')
    const result = await search(h, 'external-marker', 'External')
    await set(h, 'openNote', 'External.md')
    ok((await act(h, 'readState')).markdown.includes('external-marker'), 'external note unreadable')
    return result
  },

  'external-folder-refresh': async (h) => {
    await set(h, 'selectVault', h.vaultRoot)
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
    await set(h, 'selectVault', h.vaultRoot)
    const created = await set(h, 'invokeTauri', 'tauri_drawings_create', { title: 'Matrix drawing' })
    const opened = await set(h, 'openExcalidraw', 'matrix.excalidraw.png')
    const drawing = await set(h, 'readExcalidraw')
    const closed = await set(h, 'closeExcalidraw')
    ok(created.fullPath && existsSync(created.fullPath) && opened.hasCanvas && drawing.hasCanvas && !drawing.hasError && !closed.open, 'excalidraw')
    return { created, opened, closed }
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
    await set(h, 'selectVault', h.vaultRoot)
    await set(h, 'createFolder', 'Drop target')
    await set(h, 'dropFiles', '.folder-name[title="Drop target"], .en-sidebar', [
      { name: 'drop.txt', type: 'text/plain', content: 'drop-marker' }
    ])
    const path = join(h.vaultRoot, 'Drop target/drop.txt')
    for (let attempt = 0; attempt < 200 && !existsSync(path); attempt += 1) await z(100)
    ok(existsSync(path), 'drop folder failed')
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
    const result = await dropFileLink(h, {
      name: 'linked.txt',
      type: 'text/plain',
      content: 'linked'
    })
    ok(readFileSync(result.assetPath, 'utf8') === 'linked', 'linked attachment bytes differ')
    return result
  },

  'pdf-addon-open-route': async (h) => {
    await set(h, 'installPdfViewerProbe')
    try {
      const result = await dropFileLink(h, {
        name: 'addon-route.pdf',
        type: 'application/pdf',
        content: '%PDF-1.4\naddon-route\n%%EOF\n'
      })
      const routed = await openHistory(h, (entry) => entry.route === 'pdf-addon', 'PDF addon route')
      ok(routed.handled === true && routed.path === result.assetPath, `wrong PDF addon route: ${JSON.stringify(routed)}`)
      return { ...result, routed }
    } finally {
      await set(h, 'removePdfViewerProbe')
    }
  },

  'pdf-system-open-fallback': async (h) => {
    await set(h, 'removePdfViewerProbe')
    const result = await dropFileLink(h, {
      name: 'system-route.pdf',
      type: 'application/pdf',
      content: '%PDF-1.4\nsystem-route\n%%EOF\n'
    })
    const routed = await openHistory(h, (entry) => entry.route === 'system-path', 'PDF system route')
    ok(routed.handled === true && routed.path === result.assetPath, `wrong PDF system route: ${JSON.stringify(routed)}`)
    ok(!routed.error, `system PDF opener failed: ${routed.error}`)
    return { ...result, routed }
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
    await h.writeEvidence({ status: 'PROVEN', extra: { featureId: id, evidence } })
  } catch (error) {
    e = error
    await h.writeEvidence({ status: 'NOT PROVEN', error, extra: { featureId: id } })
  } finally {
    await h.cleanup()
  }

  out.push({
    id,
    ok: !e,
    status: e ? 'NOT PROVEN' : 'PROVEN',
    durationMs: Date.now() - startedAt,
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
  features: out,
  missing
}
writeFileSync(join(O, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`[matrix] ${result.status} ${out.length - missing.length}/${out.length}`)
if (missing.length) process.exit(1)
