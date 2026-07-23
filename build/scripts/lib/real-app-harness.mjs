#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../../..')
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const FRONTEND_ACTIONS = new Set([
  'click',
  'contextClick',
  'fill',
  'insertText',
  'press',
  'selectText',
  'waitFor',
  'waitUntilGone'
])

const FRONTEND_OBSERVATIONS = new Set([
  'logs',
  'readDisplayed',
  'readDom',
  'readState'
])

const ensureRelativePath = (relativePath) => {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.startsWith('/') || relativePath.includes('..')) {
    throw new TypeError(`Fixture path must stay inside the vault: ${JSON.stringify(relativePath)}`)
  }
  return relativePath
}

const normalizeError = (error) => error?.stack || error?.message || String(error)

export const createRealAppHarness = ({
  suite,
  initialFiles = {},
  requirePackagedApp = false,
  buildRenderer = false
}) => {
  if (!suite || typeof suite !== 'string') throw new TypeError('suite is required')

  if (buildRenderer && process.env.ELEPHANT_ACCEPTANCE_SKIP_BUILD !== '1') {
    console.log(`[${suite}] building the current Tauri renderer`)
    execFileSync('pnpm', ['tauri:web:build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ELEPHANT_ACCEPTANCE_BUILD: '1' }
    })
  }

  const fixtureRoot = mkdtempSync(join(tmpdir(), `elephant-${suite}-`))
  const vaultRoot = join(fixtureRoot, 'vault')
  const configRoot = join(fixtureRoot, 'config')
  const artifactRoot = join(root, 'test-results', 'trusted', suite)
  mkdirSync(join(vaultRoot, '.elephantnote'), { recursive: true })
  mkdirSync(configRoot, { recursive: true })
  mkdirSync(artifactRoot, { recursive: true })
  writeFileSync(join(vaultRoot, '.elephantnote', 'workspace.json'), JSON.stringify({ version: 1, vaultName: suite, sidebar: [] }), 'utf8')
  writeFileSync(join(configRoot, 'elephantnote.json'), JSON.stringify({ vaults: [], activeVaultId: null }), 'utf8')

  for (const [relativePath, content] of Object.entries(initialFiles)) {
    const safePath = ensureRelativePath(relativePath)
    const absolutePath = join(vaultRoot, safePath)
    mkdirSync(resolve(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, String(content), 'utf8')
  }

  const originalHome = process.env.HOME || '/tmp'
  const appPath = process.env.ELEPHANT_ACCEPTANCE_APP_PATH || './build/scripts/build_dev.sh'
  const packagedApp = Boolean(process.env.ELEPHANT_ACCEPTANCE_APP_PATH && !/build_dev\.sh$/.test(appPath))
  if (requirePackagedApp) {
    if (!process.env.ELEPHANT_ACCEPTANCE_APP_PATH) {
      throw new Error(`${suite} requires ELEPHANT_ACCEPTANCE_APP_PATH pointing to the packaged release executable`)
    }
    if (!packagedApp) {
      throw new Error(`${suite} refuses the development launcher; the exact packaged executable is required`)
    }
    if (!existsSync(appPath)) throw new Error(`${suite} packaged executable does not exist: ${appPath}`)
  }

  const token = randomBytes(32).toString('hex')
  let child = null
  let endpoint = null
  let output = ''
  const scenarios = []
  const setupCommands = []
  const actionCommands = []

  const collect = (prefix, chunk) => {
    const text = chunk.toString()
    output += text
    process.stdout.write(`${prefix}${text}`)
  }

  const start = async() => {
    const outputOffset = output.length
    console.log(`[${suite}] launching ${appPath}`)
    child = spawn(appPath, [], {
      cwd: root,
      env: {
        ...process.env,
        HOME: fixtureRoot,
        PNPM_HOME: process.env.PNPM_HOME || `${originalHome}/Library/pnpm`,
        RUSTUP_HOME: process.env.RUSTUP_HOME || `${originalHome}/.rustup`,
        CARGO_HOME: process.env.CARGO_HOME || `${originalHome}/.cargo`,
        ELEPHANTNOTE_CONFIG_DIR: configRoot,
        ELEPHANT_AUTOMATION_PORT: '0',
        ELEPHANT_AUTOMATION_TOKEN: token
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (chunk) => collect(`[${suite}:app] `, chunk))
    child.stderr.on('data', (chunk) => collect(`[${suite}:app:error] `, chunk))

    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const match = output.slice(outputOffset).match(/ELEPHANT_AUTOMATION_PORT=(\d+)/)
      if (match) endpoint = `http://127.0.0.1:${Number(match[1])}`
      if (endpoint) {
        try {
          const health = await fetch(`${endpoint}/v1/health`).then((response) => response.json())
          if (health.transport === 'tauri' && health.ready === true) return health
        } catch {
          // The listener can become reachable a few milliseconds before its
          // renderer bridge is ready. Keep polling within the startup deadline.
        }
      }
      if (child.exitCode !== null) throw new Error(`${suite} application exited before automation became ready (${child.exitCode})`)
      await sleep(250)
    }
    throw new Error(`${suite} timed out waiting for the application automation endpoint`)
  }

  const stop = async(signal = 'SIGTERM') => {
    if (!child || child.exitCode !== null) return
    const runningChild = child
    await new Promise((resolvePromise) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        resolvePromise()
      }
      runningChild.once('close', finish)
      try {
        process.kill(-runningChild.pid, signal)
      } catch {
        try {
          runningChild.kill(signal)
        } catch {
          finish()
        }
      }
      setTimeout(finish, signal === 'SIGKILL' ? 2_000 : 8_000)
    })
    child = null
    endpoint = null
  }

  const restart = async({ crash = false } = {}) => {
    await stop(crash ? 'SIGKILL' : 'SIGTERM')
    return start()
  }

  const rawCommand = async(commandName, ...args) => {
    if (!endpoint) throw new Error(`${suite} application is not running`)
    const startedAt = Date.now()
    const response = await fetch(`${endpoint}/v1/command`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ command: commandName, args })
    })
    const body = await response.json()
    const detail = { command: commandName, durationMs: Date.now() - startedAt, requestId: body.requestId || null }
    console.log(`[${suite}] command ${response.ok && body.ok ? 'ok' : 'failed'} ${JSON.stringify(detail)}`)
    if (!response.ok || !body.ok) throw new Error(`${commandName} failed: ${body.error || response.status}`)
    return body.result
  }

  const setup = async(commandName, ...args) => {
    const result = await rawCommand(commandName, ...args)
    setupCommands.push({ at: new Date().toISOString(), command: commandName, argsCount: args.length })
    return result
  }

  const action = async(layer, commandName, ...args) => {
    if (layer !== 'frontend' && layer !== 'user-journey') {
      throw new TypeError(`Action layer must be frontend or user-journey, received ${JSON.stringify(layer)}`)
    }
    if (!FRONTEND_ACTIONS.has(commandName) && !FRONTEND_OBSERVATIONS.has(commandName)) {
      throw new Error(`${suite} ${layer} scenario attempted forbidden internal command ${commandName}`)
    }
    const result = await rawCommand(commandName, ...args)
    actionCommands.push({ at: new Date().toISOString(), layer, command: commandName, argsCount: args.length })
    return result
  }

  const backend = async(commandName, ...args) => {
    const result = await rawCommand(commandName, ...args)
    actionCommands.push({ at: new Date().toISOString(), layer: 'backend', command: commandName, argsCount: args.length })
    return result
  }

  const runScenario = async(id, layer, callback) => {
    const startedAt = Date.now()
    try {
      const evidence = await callback()
      const scenario = { id, layer, ok: true, durationMs: Date.now() - startedAt, evidence: evidence ?? null }
      scenarios.push(scenario)
      console.log(`[${suite}] PASS ${id}`)
      return scenario
    } catch (error) {
      const scenario = { id, layer, ok: false, durationMs: Date.now() - startedAt, error: normalizeError(error) }
      scenarios.push(scenario)
      console.error(`[${suite}] FAIL ${id}: ${scenario.error}`)
      throw error
    }
  }

  const readVaultFile = (relativePath) => readFileSync(join(vaultRoot, ensureRelativePath(relativePath)), 'utf8')

  const waitForVaultFile = async(relativePath, predicate, timeoutMs = 15_000) => {
    const absolutePath = join(vaultRoot, ensureRelativePath(relativePath))
    const deadline = Date.now() + timeoutMs
    let content = ''
    while (Date.now() <= deadline) {
      if (existsSync(absolutePath)) {
        content = readFileSync(absolutePath, 'utf8')
        if (predicate(content)) return content
      }
      await sleep(100)
    }
    throw new Error(`Timed out waiting for persisted vault file ${relativePath}; last content=${JSON.stringify(content)}`)
  }

  const writeEvidence = async({ status, error = null, extra = {} }) => {
    let logs = []
    if (endpoint) {
      try {
        logs = await rawCommand('logs')
      } catch (logError) {
        logs = [{ level: 'error', event: 'evidence:logs:error', error: normalizeError(logError) }]
      }
    }
    const evidence = {
      at: new Date().toISOString(),
      suite,
      status,
      runtime: 'tauri',
      packagedApp,
      packagedAppRequired: requirePackagedApp,
      appPath,
      error: error ? normalizeError(error) : null,
      scenarios,
      commandPolicy: {
        setupCommands,
        actionCommands,
        frontendAllowedActions: [...FRONTEND_ACTIONS],
        frontendAllowedObservations: [...FRONTEND_OBSERVATIONS]
      },
      logs,
      ...extra
    }
    writeFileSync(join(artifactRoot, 'latest.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    writeFileSync(join(artifactRoot, 'latest-tauri.log'), output, 'utf8')
    console.log(`[${suite}] evidence ${join(artifactRoot, 'latest.json')}`)
    return evidence
  }

  const cleanup = async() => {
    await stop()
    writeFileSync(join(artifactRoot, 'latest-tauri.log'), output, 'utf8')
    if (process.env.ELEPHANT_KEEP_TEST_FIXTURES === '1') {
      console.log(`[${suite}] keeping fixture ${fixtureRoot}`)
    } else {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  }

  return {
    root,
    suite,
    fixtureRoot,
    vaultRoot,
    configRoot,
    artifactRoot,
    appPath,
    scenarios,
    start,
    stop,
    restart,
    setup,
    action,
    backend,
    runScenario,
    readVaultFile,
    waitForVaultFile,
    writeEvidence,
    cleanup,
    get output() { return output }
  }
}
