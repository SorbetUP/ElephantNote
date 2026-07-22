#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const artifactRoot = join(root, 'test-results', 'trusted', 'markdown-editor')
const fixtureRoot = mkdtempSync(join(tmpdir(), 'elephant-markdown-trust-'))
const vaultRoot = join(fixtureRoot, 'vault')
const configRoot = join(fixtureRoot, 'config')
const notePath = 'Markdown trust.md'
const editorSelector = '[data-testid="muya-rust-runtime-editor"]'
const token = randomBytes(32).toString('hex')
const appPath = process.env.ELEPHANT_ACCEPTANCE_APP_PATH || './build/scripts/build_dev.sh'
const scenarioResults = []
let child
let endpoint = ''
let output = ''

mkdirSync(artifactRoot, { recursive: true })
mkdirSync(join(vaultRoot, '.elephantnote'), { recursive: true })
mkdirSync(configRoot, { recursive: true })
writeFileSync(join(vaultRoot, notePath), '# Markdown trust\n\nInitial\n', 'utf8')
writeFileSync(
  join(vaultRoot, '.elephantnote', 'workspace.json'),
  JSON.stringify({ version: 1, vaultName: 'Markdown trust', sidebar: [] }),
  'utf8'
)
writeFileSync(
  join(configRoot, 'elephantnote.json'),
  JSON.stringify({ vaults: [], activeVaultId: null }),
  'utf8'
)

if (process.env.ELEPHANT_ACCEPTANCE_SKIP_BUILD !== '1') {
  console.log('[markdown-trust] building the current Tauri renderer')
  execFileSync('pnpm', ['tauri:web:build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELEPHANT_ACCEPTANCE_BUILD: '1' }
  })
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const normalize = (value) => String(value || '').replace(/\r\n/g, '\n')
const collect = (prefix, chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(`${prefix}${text}`)
}

const stopChild = () => new Promise((resolvePromise) => {
  if (!child || child.exitCode !== null) return resolvePromise()
  const finish = () => resolvePromise()
  child.once('close', finish)
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  setTimeout(finish, 5000)
})

const startChild = async() => {
  const outputOffset = output.length
  console.log(`[markdown-trust] launching ${appPath}`)
  child = spawn(appPath, [], {
    cwd: root,
    env: {
      ...process.env,
      HOME: fixtureRoot,
      ELEPHANTNOTE_CONFIG_DIR: configRoot,
      ELEPHANT_AUTOMATION_PORT: '0',
      ELEPHANT_AUTOMATION_TOKEN: token
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => collect('[elephant] ', chunk))
  child.stderr.on('data', (chunk) => collect('[elephant:error] ', chunk))

  const portDeadline = Date.now() + 120_000
  while (Date.now() < portDeadline) {
    const match = output.slice(outputOffset).match(/ELEPHANT_AUTOMATION_PORT=(\d+)/)
    if (match) {
      endpoint = `http://127.0.0.1:${Number(match[1])}`
      break
    }
    if (child.exitCode !== null) {
      throw new Error(`Elephant exited before its automation API started (${child.exitCode})`)
    }
    await sleep(100)
  }
  if (!endpoint) throw new Error('Timed out waiting for the Elephant automation API port')

  const readyDeadline = Date.now() + 120_000
  while (Date.now() < readyDeadline) {
    const health = await fetch(`${endpoint}/v1/health`).then((response) => response.json()).catch(() => null)
    if (health?.ready === true && health?.transport === 'tauri') return
    if (child.exitCode !== null) throw new Error(`Elephant exited before its renderer was ready (${child.exitCode})`)
    await sleep(100)
  }
  throw new Error('Timed out waiting for the Elephant renderer automation bridge')
}

const request = async(path, { method = 'GET', body } = {}) => {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const payload = await response.json()
  if (!response.ok || payload?.ok === false) {
    throw new Error(`${method} ${path} failed: ${payload?.error || response.status}`)
  }
  return payload
}

const command = async(commandName, ...args) => {
  const payload = await request('/v1/command', {
    method: 'POST',
    body: { command: commandName, args }
  })
  return payload.result
}

const waitForMarkdown = async(predicate, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let state
  while (Date.now() <= deadline) {
    state = await command('readState')
    if (predicate(normalize(state?.markdown), state)) return state
    await sleep(50)
  }
  throw new Error(`${label}: Markdown state did not reach the expected value: ${JSON.stringify(state)}`)
}

const setMarkdownAndCaret = async(markdown, position = 'end') => {
  await command('setMarkdown', markdown)
  const editor = await command('waitFor', editorSelector, 10_000)
  if (!editor?.exists || !editor?.visible) {
    throw new Error(`Rust editor is not visible: ${JSON.stringify(editor)}`)
  }
  const offset = position === 'end' ? editor.text.length : Number(position)
  await command('selectText', editorSelector, offset, offset)
  return editor
}

const assertNoCodeBlock = async(label) => {
  const codeBlocks = await command('queryAll', '[data-elephant-editor-kind="code_block"]')
  if (codeBlocks.length !== 0) {
    throw new Error(`${label}: unexpected code block appeared: ${JSON.stringify(codeBlocks)}`)
  }
}

const runScenario = async(id, description, scenario) => {
  const startedAt = Date.now()
  try {
    const evidence = await scenario()
    const result = { id, description, ok: true, durationMs: Date.now() - startedAt, evidence }
    scenarioResults.push(result)
    console.log(`[markdown-trust] PASS ${id} ${result.durationMs}ms`)
    return evidence
  } catch (error) {
    const result = {
      id,
      description,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error?.stack || String(error)
    }
    scenarioResults.push(result)
    console.error(`[markdown-trust] FAIL ${id}\n${result.error}`)
    throw error
  }
}

let finalMarkdown = ''
try {
  await startChild()
  await runScenario('app-starts', 'The packaged Tauri renderer exposes a visible Rust editor.', async() => {
    const health = await request('/v1/health')
    await command('selectVault', vaultRoot)
    const opened = await command('openNote', notePath)
    const editor = await command('waitFor', editorSelector, 10_000)
    const ui = await request(`/v1/ui?selector=${encodeURIComponent(editorSelector)}`)
    if (!opened?.rustEditorPresent || opened?.codeMirrorPresent || !editor?.visible || !ui?.result?.root?.visible) {
      throw new Error(`Real editor surface is incomplete: ${JSON.stringify({ opened, editor, ui })}`)
    }
    await command('clearLogs')
    return { health, opened, editor: ui.result.root }
  })

  await runScenario('plain-return', 'Enter creates a real line break without inventing code formatting.', async() => {
    await setMarkdownAndCaret('alpha')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('alpha') && markdown.includes('beta') && /alpha[\s\S]*\nbeta/.test(markdown),
      'plain-return'
    )
    if (normalize(state.markdown).includes('```')) throw new Error(`plain-return created a code fence: ${state.markdown}`)
    await assertNoCodeBlock('plain-return')
    await command('save')
    const disk = await command('readNote', notePath)
    if (!normalize(disk.content).includes('alpha') || !normalize(disk.content).includes('beta')) {
      throw new Error(`plain-return was not persisted: ${JSON.stringify(disk)}`)
    }
    return { markdown: state.markdown, disk: disk.content }
  })

  await runScenario('cursor-middle-return', 'Moving the caret into plain text and pressing Enter splits the text without changing its block type.', async() => {
    await setMarkdownAndCaret('alphomega', 4)
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown(
      (markdown) => /alph[\s\S]*beta[\s\S]*omega/.test(markdown) && markdown.includes('\n'),
      'cursor-middle-return'
    )
    await assertNoCodeBlock('cursor-middle-return')
    return { markdown: state.markdown }
  })

  await runScenario('arrow-cursor-return', 'Arrow-key cursor movement followed by Enter remains plain text and does not crash.', async() => {
    await setMarkdownAndCaret('prefixsuffix')
    for (let index = 0; index < 6; index += 1) await command('press', editorSelector, 'ArrowLeft')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'middle')
    const state = await waitForMarkdown(
      (markdown) => /prefix[\s\S]*middle[\s\S]*suffix/.test(markdown) && markdown.includes('\n'),
      'arrow-cursor-return'
    )
    await assertNoCodeBlock('arrow-cursor-return')
    return { markdown: state.markdown }
  })

  await runScenario('selection-replace', 'Replacing a real selection changes only the selected text and preserves the plain paragraph.', async() => {
    await command('setMarkdown', 'alpha omega')
    const editor = await command('waitFor', editorSelector, 10_000)
    await command('selectText', editorSelector, 6, 11)
    await command('insertText', editorSelector, 'beta')
    const state = await waitForMarkdown(
      (markdown) => markdown.trim() === 'alpha beta',
      'selection-replace'
    )
    await assertNoCodeBlock('selection-replace')
    return { markdown: state.markdown, selectedFrom: editor.text.slice(6, 11) }
  })

  await runScenario('multiline-insert', 'A multiline real input creates ordinary paragraphs without inheriting code formatting.', async() => {
    await setMarkdownAndCaret('before')
    await command('insertText', editorSelector, '\nline-one\nline-two')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('before') && markdown.includes('line-one') && markdown.includes('line-two') && (markdown.match(/\n/g) || []).length >= 2,
      'multiline-insert'
    )
    if (normalize(state.markdown).includes('```')) throw new Error(`multiline-insert created a code fence: ${state.markdown}`)
    await assertNoCodeBlock('multiline-insert')
    return { markdown: state.markdown }
  })

  await runScenario('inline-code-boundary-return', 'Enter after inline code starts a plain line instead of extending code formatting.', async() => {
    await setMarkdownAndCaret('before `code`')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'plain')
    const state = await waitForMarkdown(
      (markdown) => /before `code`\s*\nplain(?:\n|$)/.test(markdown),
      'inline-code-boundary-return'
    )
    const markdown = normalize(state.markdown)
    if ((markdown.match(/`/g) || []).length !== 2) {
      throw new Error(`inline-code-boundary-return changed inline-code delimiters: ${markdown}`)
    }
    await assertNoCodeBlock('inline-code-boundary-return')
    return { markdown }
  })

  await runScenario('list-return', 'Enter continues a Markdown list through the real editor runtime.', async() => {
    await setMarkdownAndCaret('- first')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'second')
    const state = await waitForMarkdown(
      (markdown) => /(^|\n)- first\s*\n- second(\n|$)/.test(markdown),
      'list-return'
    )
    await assertNoCodeBlock('list-return')
    return { markdown: state.markdown }
  })

  await runScenario('empty-list-exit', 'A second Enter exits an empty list item and creates a plain paragraph.', async() => {
    await setMarkdownAndCaret('- first')
    await command('press', editorSelector, 'Enter')
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'plain')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('- first') && markdown.includes('plain') && !/(^|\n)- plain(\n|$)/.test(markdown),
      'empty-list-exit'
    )
    await assertNoCodeBlock('empty-list-exit')
    return { markdown: state.markdown }
  })

  await runScenario('code-boundary-return', 'Enter after a fenced code block stays outside the code block and does not create another fence.', async() => {
    const initial = '# Boundary\n\n```js\nconst value = 1\n```\n\noutside'
    await setMarkdownAndCaret(initial)
    await command('press', editorSelector, 'Enter')
    await command('insertText', editorSelector, 'tail')
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('outside') && markdown.includes('tail'),
      'code-boundary-return'
    )
    const markdown = normalize(state.markdown)
    const fences = markdown.match(/```/g) || []
    const codeBlocks = await command('queryAll', '[data-elephant-editor-kind="code_block"]')
    if (fences.length !== 2 || codeBlocks.length !== 1 || markdown.lastIndexOf('tail') < markdown.lastIndexOf('```')) {
      throw new Error(`Caret escaped into code formatting: ${JSON.stringify({ markdown, fences: fences.length, codeBlocks })}`)
    }
    return { markdown, codeBlockCount: codeBlocks.length }
  })

  await runScenario('return-stress-no-crash', 'Repeated real Enter/input operations keep the renderer alive and error-free.', async() => {
    await setMarkdownAndCaret('stress-start')
    for (let index = 1; index <= 12; index += 1) {
      await command('press', editorSelector, 'Enter')
      await command('insertText', editorSelector, `line-${index}`)
    }
    const state = await waitForMarkdown(
      (markdown) => markdown.includes('line-1') && markdown.includes('line-12'),
      'return-stress-no-crash',
      15_000
    )
    const editor = await command('readDom', editorSelector)
    const errors = await command('logs', { level: 'error', limit: 5000 })
    if (!editor?.visible || errors.length !== 0) {
      throw new Error(`Return stress produced a crash or logged error: ${JSON.stringify({ editor, errors })}`)
    }
    await command('save')
    finalMarkdown = normalize(state.markdown)
    const disk = normalize(readFileSync(join(vaultRoot, notePath), 'utf8'))
    if (disk !== finalMarkdown) {
      throw new Error(`Saved Markdown differs from the real editor state: ${JSON.stringify({ finalMarkdown, disk })}`)
    }
    return { markdown: finalMarkdown, editor, errorCount: errors.length }
  })

  await runScenario('restart-persistence', 'The exact Markdown survives process termination and a clean application restart.', async() => {
    await stopChild()
    endpoint = ''
    await startChild()
    await command('selectVault', vaultRoot)
    await command('openNote', notePath)
    const state = await waitForMarkdown((markdown) => markdown === finalMarkdown, 'restart-persistence', 15_000)
    const disk = normalize(await command('readNote', notePath).then((note) => note.content))
    const ui = await request(`/v1/ui?selector=${encodeURIComponent(editorSelector)}`)
    const errors = await command('logs', { level: 'error', limit: 5000 })
    if (disk !== finalMarkdown || !ui?.result?.root?.visible || errors.length !== 0) {
      throw new Error(`Restart persistence failed: ${JSON.stringify({ state, disk, ui, errors })}`)
    }
    return { markdown: state.markdown, disk, editor: ui.result.root, errorCount: errors.length }
  })

  writeFileSync(
    join(artifactRoot, 'latest.json'),
    `${JSON.stringify({
      at: new Date().toISOString(),
      status: 'PROVEN',
      runtime: 'tauri',
      appPath,
      scenarios: scenarioResults
    }, null, 2)}\n`,
    'utf8'
  )
  writeFileSync(join(artifactRoot, 'latest.log'), output, 'utf8')
  console.log(`[markdown-trust] PASS scenarios=${scenarioResults.length}`)
} catch (error) {
  const errors = endpoint
    ? await command('logs', { level: 'error', limit: 5000 }).catch(() => [])
    : []
  writeFileSync(
    join(artifactRoot, 'latest.json'),
    `${JSON.stringify({
      at: new Date().toISOString(),
      status: 'NOT PROVEN',
      runtime: 'tauri',
      appPath,
      error: error?.stack || String(error),
      rendererErrors: errors,
      scenarios: scenarioResults
    }, null, 2)}\n`,
    'utf8'
  )
  writeFileSync(join(artifactRoot, 'latest.log'), output, 'utf8')
  throw error
} finally {
  await stopChild()
  writeFileSync(join(artifactRoot, 'latest.log'), output, 'utf8')
  rmSync(fixtureRoot, { recursive: true, force: true })
}
