#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRealAppHarness } from './lib/real-app-harness.mjs'

const restartPath = 'Backend restart persistence.md'

const harness = createRealAppHarness({
  suite: 'backend-contract',
  buildRenderer: true,
  initialFiles: {
    'Backend fixture.md': '# Backend fixture\n\nInitial backend content.\n',
    [restartPath]: '# Backend restart fixture\n\nInitial restart content.\n',
    'outside.md': '# Contained vault file\n\ninside-vault-marker\n'
  }
})

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const waitForNoteContent = async(relativePath, expected, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let last = null
  let lastError = null
  while (Date.now() <= deadline) {
    try {
      last = await harness.backend('invokeTauri', 'tauri_notes_read', { relativePath })
      lastError = null
      if (last?.content === expected || last?.markdown === expected) return last
    } catch (error) {
      lastError = error
    }
    await sleep(50)
  }
  const diagnostic = lastError?.stack || lastError?.message || lastError || last
  throw new Error(`${label}: production note content did not reach the expected value: ${JSON.stringify(diagnostic)}`)
}

const waitForStableNoteContent = async(relativePath, expected, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let stableReads = 0
  let last = null
  let lastError = null
  while (Date.now() <= deadline) {
    try {
      last = await harness.backend('invokeTauri', 'tauri_notes_read', { relativePath })
      lastError = null
      const matches = last?.content === expected || last?.markdown === expected
      stableReads = matches ? stableReads + 1 : 0
      if (stableReads >= 4) return last
    } catch (error) {
      lastError = error
      stableReads = 0
    }
    await sleep(75)
  }
  const diagnostic = lastError?.stack || lastError?.message || lastError || last
  throw new Error(`${label}: production note content did not become stable: ${JSON.stringify(diagnostic)}`)
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
    const destinationFolder = await harness.backend('invokeTauri', 'tauri_folders_create', { relativePath: 'Backend archive' })
    const created = await harness.backend('invokeTauri', 'tauri_notes_create', {
      relativePath: 'Backend contracts',
      filename: 'Lifecycle.md',
      title: 'Lifecycle'
    })
    const createdPath = 'Backend contracts/Lifecycle.md'
    const createdContent = '# Lifecycle\n'
    await waitForStableNoteContent(createdPath, createdContent, 'Production note creation stabilization')

    await harness.backend('invokeTauri', 'tauri_entries_rename', {
      relativePath: createdPath,
      title: 'Renamed backend lifecycle'
    })
    const renamedPath = 'Backend contracts/Renamed backend lifecycle.md'
    await waitForNoteContent(renamedPath, createdContent, 'Renamed note content preservation')
    await harness.backend('invokeTauri', 'tauri_entries_move', {
      relativePath: renamedPath,
      targetDirectoryPath: 'Backend archive'
    })
    const movedPath = 'Backend archive/Renamed backend lifecycle.md'
    await waitForNoteContent(movedPath, createdContent, 'Renamed/moved note content preservation')

    const writePath = 'Backend fixture.md'
    const expected = '# Backend roundtrip\n\nWritten through the production Tauri backend.\n'
    const written = await harness.backend('invokeTauri', 'tauri_notes_write', {
      relativePath: writePath,
      content: expected,
      markdown: expected
    })
    if (written?.path !== writePath) {
      throw new Error(`Production note write returned the wrong path: ${JSON.stringify(written)}`)
    }
    await waitForStableNoteContent(writePath, expected, 'Production note write/read round-trip')
    const disk = harness.readVaultFile(writePath)
    if (disk !== expected) {
      throw new Error(`Production note write did not persist exact disk content: ${JSON.stringify({ expected, disk })}`)
    }

    await harness.backend('invokeTauri', 'tauri_entries_delete', { relativePath: movedPath })
    const folderEntries = await harness.backend('invokeTauri', 'tauri_directory_list', {
      relativePath: 'Backend archive',
      offset: 0,
      limit: 1000,
      includePreview: false
    })
    if (folderEntries.some((entry) => entry.path === movedPath)) {
      throw new Error(`Deleted note remains visible in the production backend: ${JSON.stringify(folderEntries)}`)
    }
    return {
      folder: folder?.path || null,
      destinationFolder: destinationFolder?.path || null,
      created: created?.path || null,
      backendWrittenPath: writePath,
      backendMovedPath: movedPath,
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
    if (!rejection && response?.content && response.content !== '# Contained vault file\n\ninside-vault-marker\n') {
      throw new Error(`Traversal did not fail closed: ${serialized}`)
    }
    return { rejected: Boolean(rejection), response: response || null }
  })

  await harness.runScenario('backend-persistence-after-restart', 'backend', async() => {
    const expected = '# Backend restart persistence\n\nThis content must survive a complete application restart.\n'
    const written = await harness.backend('invokeTauri', 'tauri_notes_write', {
      relativePath: restartPath,
      content: expected,
      markdown: expected
    })
    if (written?.path !== restartPath) {
      throw new Error(`Restart persistence write returned the wrong path: ${JSON.stringify(written)}`)
    }
    await waitForStableNoteContent(restartPath, expected, 'Pre-restart persistence stabilization')
    await harness.restart({ crash: true })
    await harness.setup('selectVault', harness.vaultRoot)
    const restored = await waitForStableNoteContent(restartPath, expected, 'Post-SIGKILL persisted note verification')
    const disk = harness.readVaultFile(restartPath)
    if (disk !== expected) throw new Error(`Restart persistence disk content differs: ${JSON.stringify({ expected, disk })}`)
    return {
      path: restartPath,
      bytes: expected.length,
      restoredBytes: String(restored?.content ?? restored?.markdown ?? '').length,
      restartMode: 'sigkill-full-process-restart'
    }
  })

  await harness.writeEvidence({
    status: 'PROVEN',
    extra: {
      proofBoundary: 'Production Tauri/backend commands against a real vault filesystem, including SIGKILL full-process restart persistence.'
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
