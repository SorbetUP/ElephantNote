#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../..')
if (process.env.ELEPHANT_ACCEPTANCE_SKIP_BUILD === '1') {
  console.log('[acceptance-runner] using existing renderer build by explicit request')
} else {
  console.log('[acceptance-runner] building renderer with the current source')
  execFileSync('pnpm', ['tauri:web:build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELEPHANT_ACCEPTANCE_BUILD: '1' }
  })
}
const electronRoots = [join(root, 'node_modules', 'electron'), join(root, 'Elephant', 'node_modules', 'electron')]
const packageRoot = electronRoots.find((candidate) => existsSync(join(candidate, 'path.txt')))
if (!packageRoot) throw new Error(`Electron binary is not installed. Checked: ${electronRoots.join(', ')}`)
const electronPath = join(packageRoot, 'dist', readFileSync(join(packageRoot, 'path.txt'), 'utf8').trim())
const port = Number(process.env.ELEPHANT_ACCEPTANCE_CDP_PORT || 9229)
const fixtureRoot = mkdtempSync(join(tmpdir(), 'elephant-acceptance-'))
const vaultRoot = join(fixtureRoot, 'vault')
const configRoot = join(fixtureRoot, 'config')
mkdirSync(join(vaultRoot, '.elephantnote'), { recursive: true })
mkdirSync(configRoot, { recursive: true })
writeFileSync(join(vaultRoot, 'Acceptance.md'), '# Acceptance\n\nInitial\n', 'utf8')
writeFileSync(join(vaultRoot, '.elephantnote', 'workspace.json'), JSON.stringify({ version: 1, vaultName: 'Acceptance', sidebar: [] }))
writeFileSync(join(configRoot, 'elephantnote.json'), JSON.stringify({ vaults: [{ id: 'acceptance', name: 'Acceptance', path: vaultRoot }], activeVaultId: 'acceptance' }))

const child = spawn(electronPath, [join(root, 'tests/app/e2e/electron-main.js')], {
  cwd: root,
  env: {
    ...process.env,
    ELEPHANTNOTE_CONFIG_DIR: configRoot,
    ELEPHANT_E2E_VAULT_ROOT: vaultRoot,
    ELEPHANT_ACCEPTANCE_CDP_PORT: String(port)
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', (chunk) => process.stdout.write(`[desktop-app] ${chunk}`))
child.stderr.on('data', (chunk) => process.stderr.write(`[desktop-app:error] ${chunk}`))

const waitFor = async(url, timeout = 30000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const page = await waitFor(`http://127.0.0.1:${port}/json/list`)
const socket = new WebSocket(page.find((entry) => entry.type === 'page')?.webSocketDebuggerUrl)
await new Promise((resolvePromise, reject) => {
  socket.addEventListener('open', resolvePromise, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let sequence = 0
const evaluate = (expression) => new Promise((resolvePromise, reject) => {
  const id = ++sequence
  const listener = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== id) return
    socket.removeEventListener('message', listener)
    if (message.error) reject(new Error(message.error.message))
    else if (message.result?.exceptionDetails) {
      const exception = message.result.exceptionDetails
      reject(new Error(
        exception.exception?.description || exception.text || 'Renderer evaluation failed'
      ))
    } else resolvePromise(message.result?.result?.value)
  }
  socket.addEventListener('message', listener)
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
})

const waitForBridge = async() => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      if (await evaluate('Boolean(window.__ELEPHANT_ACCEPTANCE_TEST__)')) return
    } catch (error) {
      const message = error?.message || String(error)
      if (!/default execution context|context was destroyed|target closed/i.test(message)) throw error
      console.log(`[acceptance-runner] renderer context not ready; retrying ${JSON.stringify({ message })}`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error('Timed out waiting for the renderer acceptance bridge')
}
await waitForBridge()

const result = await evaluate(`(async () => {
  const bridge = window.__ELEPHANT_ACCEPTANCE_TEST__
  if (!bridge) throw new Error('Acceptance bridge is not installed')
  await bridge.openNote('Acceptance.md')
  bridge.setMarkdown('# Acceptance\\n\\nEdited by desktop command runner.')
  const saved = await bridge.save()
  const created = await bridge.createNote('Acceptance', 'Created.md')
  await bridge.openNote('Acceptance/Created.md')
  bridge.setMarkdown('# Created\\n\\nSecond acceptance scenario.')
  const createdSaved = await bridge.save()
  const disk = await bridge.readNote('Acceptance/Created.md')
  const notes = await bridge.listNotes('Acceptance')
  return { saved, created, createdSaved, disk, notes, displayed: bridge.readDisplayed(), logs: bridge.logs() }
})()`)
if (!result?.saved?.isSaved || !result?.saved?.markdown?.includes('Edited by desktop command runner.') ||
    !result?.createdSaved?.isSaved || !result?.disk?.content?.includes('Second acceptance scenario.') ||
    !result?.notes?.some((entry) => entry.path === 'Acceptance/Created.md')) {
  throw new Error(`Desktop acceptance scenario failed: ${JSON.stringify(result)}`)
}
console.log(`[acceptance-runner] scenario passed ${JSON.stringify({ notePath: result.saved.notePath, logCount: result.logs.length })}`)
socket.close()
child.kill('SIGTERM')
rmSync(fixtureRoot, { recursive: true, force: true })
