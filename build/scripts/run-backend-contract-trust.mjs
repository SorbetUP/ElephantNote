#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRealAppHarness } from './lib/real-app-harness.mjs'

const harness = createRealAppHarness({
  suite: 'backend-contract',
  buildRenderer: true,
  initialFiles: {
    'Backend fixture.md': '# Backend fixture\n\nInitial backend content.\n',
    'outside.md': '# Contained vault file\n\ninside-vault-marker\n'
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const waitForNoteContent = async(relativePath, expected, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() <= deadline) {
    last = await harness.backend('invokeTauri', 'tauri_notes_read', { relativePath })
    if (last?.content === expected || last?.markdown === expected) return last
    await sleep(50)
  }
  throw new Error(`${label}: production note content did not reach the expected value: ${JSON.stringify(last)}`)
}

const waitForStableNoteContent = async(relativePath, expected, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let stableReads = 0
  let last = null
  while (Date.now() <= deadline) {
    last = await harness.backend('invokeTauri', 'tauri_notes_read', { relativePath })
    const matches = last?.content === expected || last?.markdown === expected
    stableReads = matches ? stableReads + 1 : 0
    if (stableReads >= 4) return last
    await sleep(75)
  }
  throw new Error(`${label}: production note content did not become stable: ${JSON.stringify(last)}`)
}

let failure = null
try {
  await harness.start()
  await harness.setup('selectVault', harness.vaultRoot)

  await harness.runScenario('backend-health-and-inventory', 'backend', async() => {
    const health = await harness.backend('invokeTauri', 'healthcheck')
    const platform = await harness.backend('invokeTauri', 'tauri_platform_info')
    const directory = await harness.backend('invokeTauri', 'tauri_directory_list', {
      relativePath: '',
      offset: 0,
      limit: 1000,
      includePreview: false
    })
    const features = await harness.backend('invokeTauri', 'tauri_features_get')
    if (!health || platform?.desktop !== true || !Array.isArray(directory) || typeof features !== 'object') {
      throw new Error(`Backend inventory is incomplete: ${JSON.stringify({ health, platform, directory, features })}`)
    }
    if (!directory.some((entry) => entry.path === 'Backend fixture.md')) {
      throw new Error(`Backend fixture is missing from the real directory listing: ${JSON.stringify(directory)}`)
    }
    return { desktop: platform.desktop, entries: directory.length, featureKeys: Object.keys(features).length }
  })

  await harness.runScenario('backend-note-crud-roundtrip', 'backend', async() => {
    const folder = await harness.backend('invokeTauri', 'tauri_folders_create', { relativePath: 'Backend contracts' })
    const created = await harness.backend('invokeTauri', 'tauri_notes_create', {
      relativePath: 'Backend contracts',
      filename: 'Lifecycle.md',
      title: 'Lifecycle'
    })
    // tauri_notes_create also updates the renderer stores. Prove the create command
    // at its settled production boundary, but keep the later write/rename/move
    // contract on a separate backend-owned path. Otherwise a renderer autosave of
    // the newly opened note can legitimately race and overwrite an unrelated
    // direct-backend assertion with the generated title.
    await waitForStableNoteContent(
      'Backend contracts/Lifecycle.md',
      '# Lifecycle\n',
      'Production note creation stabilization'
    )

    const roundtripPath = 'Backend contracts/Backend roundtrip.md'
    const expected = '# Backend roundtrip\n\nWritten through the production Tauri backend.\n'
    await harness.backend('invokeTauri', 'tauri_notes_write', {
      relativePath: roundtripPath,
      content: expected,
      markdown: expected
    })
    await waitForNoteContent(roundtripPath, expected, 'Production note write/read round-trip')
    await harness.backend('invokeTauri', 'tauri_entries_rename', {
      relativePath: roundtripPath,
      title: 'Renamed backend roundtrip'
    })
    await harness.backend('invokeTauri', 'tauri_entries_move', {
      relativePath: 'Backend contracts/Renamed backend roundtrip.md',
      targetDirectoryPath: ''
    })
    await waitForNoteContent(
      'Renamed backend roundtrip.md',
      expected,
      'Renamed/moved note content preservation'
    )
    await harness.backend('invokeTauri', 'tauri_entries_delete', { relativePath: 'Renamed backend roundtrip.md' })
    await harness.backend('invokeTauri', 'tauri_entries_delete', { relativePath: 'Backend contracts/Lifecycle.md' })
    const rootEntries = await harness.backend('invokeTauri', 'tauri_directory_list', {
      relativePath: '',
      offset: 0,
      limit: 1000,
      includePreview: false
    })
    if (rootEntries.some((entry) => entry.path === 'Renamed backend roundtrip.md')) {
      throw new Error(`Deleted note remains visible in the production backend: ${JSON.stringify(rootEntries)}`)
    }
    return {
      folder: folder?.path || null,
      created: created?.path || null,
      backendWrittenPath: roundtripPath,
      bytes: expected.length
    }
  })

  await harness.runScenario('backend-markdown-engine-contract', 'backend', async() => {
    const markdown = '# Contract\n\n[Target](Target.md)\n\n**body**'
    const rendered = await harness.backend('invokeTauri', 'tauri_markdown_render_html', { markdown })
    const plain = await harness.backend('invokeTauri', 'tauri_markdown_to_text', { markdown })
    const links = await harness.backend('invokeTauri', 'tauri_markdown_extract_links', { markdown })
    if (!rendered?.html?.includes('<h1>Contract</h1>')) throw new Error(`Markdown HTML rendering failed: ${JSON.stringify(rendered)}`)
    if (!plain?.text?.includes('body')) throw new Error(`Markdown plain-text conversion failed: ${JSON.stringify(plain)}`)
    if (!links?.links?.some((link) => JSON.stringify(link).includes('Target.md'))) {
      throw new Error(`Markdown link extraction failed: ${JSON.stringify(links)}`)
    }
    return { htmlBytes: rendered.html.length, linkCount: links.links.length }
  })

  await harness.runScenario('backend-path-containment', 'backend', async() => {
    const outsideSecret = 'outside-vault-secret-9173'
    writeFileSync(join(harness.fixtureRoot, 'outside.md'), outsideSecret, 'utf8')

    let response = null
    let rejection = null
    try {
      response = await harness.backend('invokeTauri', 'tauri_notes_read', { relativePath: '../outside.md' })
    } catch (error) {
      rejection = error?.message || String(error)
    }

    const serialized = JSON.stringify(response)
    if (serialized.includes(outsideSecret)) {
      throw new Error(`The production backend escaped the vault and disclosed the outside sentinel: ${serialized}`)
    }
    if (!rejection && !serialized.includes('inside-vault-marker')) {
      throw new Error(`Traversal input neither failed nor resolved to contained vault data: ${serialized}`)
    }
    return {
      outsideSentinelDisclosed: false,
      explicitlyRejected: Boolean(rejection),
      resolvedInsideVault: serialized.includes('inside-vault-marker'),
      rejection
    }
  })

  await harness.runScenario('backend-persistence-after-restart', 'backend', async() => {
    const expected = '# Persistence\n\nBackend survives application restart.\n'
    await harness.backend('invokeTauri', 'tauri_notes_write', {
      relativePath: 'Backend fixture.md',
      content: expected,
      markdown: expected
    })
    await waitForNoteContent('Backend fixture.md', expected, 'Backend pre-restart persistence')
    await harness.restart({ crash: true })
    const state = await harness.backend('readState')
    const persisted = await waitForNoteContent('Backend fixture.md', expected, 'Backend post-restart persistence')
    if (state.activeVault !== harness.vaultRoot) {
      throw new Error(`Active vault did not survive restart: ${JSON.stringify(state)}`)
    }
    if (persisted?.content !== expected && persisted?.markdown !== expected) {
      throw new Error(`Backend content did not survive restart: ${JSON.stringify(persisted)}`)
    }
    return { activeVault: state.activeVault, bytes: expected.length }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Direct production Tauri/backend commands, real vault filesystem, crash restart. No frontend claim.'
    }
  })
} catch (error) {
  failure = error
  await harness.writeEvidence({ status: 'NOT PROVEN', error })
} finally {
  await harness.cleanup()
}

if (failure) {
  console.error(failure?.stack || failure?.message || String(failure))
  process.exit(1)
}
