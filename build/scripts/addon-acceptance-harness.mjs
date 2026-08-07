import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync
} from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export const root = resolve(import.meta.dirname, '../..')
export const resultRoot = join(root, 'test-results', 'focused-addon-acceptance')
export const appPath = process.env.ELEPHANT_ACCEPTANCE_APP_PATH || './build/scripts/build_dev.sh'
const originalHome = process.env.HOME || '/tmp'
mkdirSync(resultRoot, { recursive: true })

export const assert = (condition, message, details = null) => {
  if (condition) return
  const error = new Error(message)
  if (details !== null) error.details = details
  throw error
}
export const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
export const walkFiles = (directory) => {
  if (!existsSync(directory)) return []
  const output = []
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name)
    const stat = statSync(absolute)
    if (stat.isDirectory()) output.push(...walkFiles(absolute))
    else output.push(absolute)
  }
  return output
}
export const relativeFiles = (directory) => walkFiles(directory)
  .map((absolute) => relative(directory, absolute).replaceAll('\\', '/')).sort()
export const markdownDigest = (directory) => Object.fromEntries(walkFiles(directory)
  .filter((path) => path.toLowerCase().endsWith('.md'))
  .map((absolute) => [
    relative(directory, absolute).replaceAll('\\', '/'),
    createHash('sha256').update(readFileSync(absolute)).digest('hex')
  ]))

export const createFixture = (id) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `elephant-focused-${id.replaceAll('.', '-')}-`))
  const vaultRoot = join(fixtureRoot, 'vault')
  const configRoot = join(fixtureRoot, 'config')
  mkdirSync(join(vaultRoot, '.elephantnote'), { recursive: true })
  mkdirSync(configRoot, { recursive: true })
  writeFileSync(join(vaultRoot, '.elephantnote', 'workspace.json'), JSON.stringify({ version: 1, vaultName: id, sidebar: [] }))
  writeFileSync(join(configRoot, 'elephantnote.json'), JSON.stringify({ vaults: [], activeVaultId: null }))
  writeFileSync(join(vaultRoot, 'Acceptance.md'), '# Acceptance\n\nCore fixture #acceptance.\n\n[[Linked Note]]\n')
  writeFileSync(join(vaultRoot, 'Linked Note.md'), '# Linked Note\n\nConnected fixture #acceptance.\n')
  return { id, fixtureRoot, vaultRoot, configRoot, child: null, endpoint: '', output: '' }
}
const collect = (context, prefix, chunk) => {
  const text = chunk.toString()
  context.output += text
  process.stdout.write(`[${context.id}]${prefix}${text}`)
}
export const startApplication = async(context) => {
  const offset = context.output.length
  const { ELEPHANT_E2E_VAULT_ROOT: _ignored, ...cleanEnv } = process.env
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
    const match = context.output.slice(offset).match(/ELEPHANT_ACCEPTANCE_TAURI_PORT=(\d+)/)
    if (match) {
      context.endpoint = `http://127.0.0.1:${Number(match[1])}`
      return
    }
    if (context.child.exitCode !== null) throw new Error(`Tauri exited before acceptance API start (${context.child.exitCode})`)
    await sleep(250)
  }
  throw new Error('Timed out waiting for packaged Tauri acceptance API')
}
export const stopApplication = async(context) => {
  const child = context.child
  context.child = null
  context.endpoint = ''
  if (!child || child.exitCode !== null) return
  await new Promise((resolvePromise) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolvePromise() } }
    child.once('close', finish)
    try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    setTimeout(finish, 5000)
  })
}
const rawCommand = async(context, commandName, ...args) => {
  const response = await fetch(`${context.endpoint}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: commandName, args })
  })
  return { response, body: await response.json() }
}
export const command = async(context, commandName, ...args) => {
  const { response, body } = await rawCommand(context, commandName, ...args)
  console.log(`[focused-addon] ${context.id} ${commandName} ${response.ok && body.ok ? 'ok' : 'failed'}`)
  if (!response.ok || !body.ok) throw new Error(`${commandName} failed: ${body.error || response.status}`)
  return body.result
}
export const expectFailure = async(context, commandName, ...args) => {
  const { response, body } = await rawCommand(context, commandName, ...args)
  assert(!response.ok && body.ok !== true && String(body.error || '').trim(), `Expected ${commandName} to fail`, { status: response.status, body })
  return { status: response.status, error: body.error }
}
export const ensureVault = async(context) => {
  const health = await fetch(`${context.endpoint}/health`).then((response) => response.json())
  assert(health.transport === 'tauri', 'Acceptance transport is not packaged Tauri', health)
  const empty = await command(context, 'readDom', '.en-empty-card')
  if (empty.exists) assert(empty.text.includes('Choose your first vault'), 'Unexpected first-run surface', empty)
  await command(context, 'selectVault', context.vaultRoot)
}
export const installEnable = async(context, addonId) => {
  const installed = await command(context, 'installOfficialAddon', addonId)
  const enabled = await command(context, 'enableAddon', addonId)
  const state = await command(context, 'addonState')
  const addon = state.addons.find((entry) => entry.id === addonId)
  assert(addon?.enabled === true && !addon?.error, `Addon ${addonId} did not enable`, { addon, state })
  return { installed, enabled, addon }
}
export const waitNative = async(context, addonId, running, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs
  let value = null
  while (Date.now() < deadline) {
    value = await command(context, 'addonNativeStatus', addonId, 'service').catch(() => null)
    if (value && Boolean(value.running) === running) return value
    await sleep(250)
  }
  const error = new Error(`Native service ${addonId} did not reach running=${running}`)
  error.details = value
  throw error
}
export const writeResult = (id, result) => {
  writeFileSync(join(resultRoot, `${id}.json`), JSON.stringify(result, null, 2))
}
export const cleanup = async(context) => {
  await stopApplication(context)
  rmSync(context.fixtureRoot, { recursive: true, force: true })
}
