#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'

const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(join(root, 'tests/trust/bazzite-proof.json'), 'utf8'))
const artifactRoot = join(root, 'test-results/trusted/bazzite-production')
const artifactPath = join(artifactRoot, 'latest.json')
const logRoot = join(artifactRoot, 'logs')
mkdirSync(logRoot, { recursive: true })

const startedAt = new Date()
const cliArguments = process.argv.slice(2)
const quick = cliArguments.includes('--quick') || process.env.ELEPHANT_BAZZITE_QUICK === '1'
const positionalArguments = cliArguments.filter((argument) => !argument.startsWith('--'))
const rawAppPath = positionalArguments[0] || process.env.ELEPHANT_ACCEPTANCE_APP_PATH || ''
const appPath = rawAppPath ? resolve(rawAppPath) : ''
const expectedSha256 = String(process.env.ELEPHANT_EXPECTED_APPIMAGE_SHA256 || positionalArguments[1] || '').trim().toLowerCase()
const suites = []
const preflight = {}
let failure = null

const normalizeError = (error) => error?.stack || error?.message || String(error)
const read = (path) => readFileSync(path, 'utf8')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const run = (command, args = [], options = {}) => spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ...(options.env || {}) },
  maxBuffer: 64 * 1024 * 1024
})
const commandText = (command, args = []) => {
  const result = run(command, args)
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? normalizeError(result.error) : null
  }
}
const requireCondition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const runSuite = (id, command, args, env) => {
  const result = run(command, args, { env })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const logPath = join(logRoot, `${id}.log`)
  writeFileSync(logPath, output, 'utf8')
  const suite = {
    id,
    ok: result.status === 0,
    status: result.status,
    command: [command, ...args],
    logPath: logPath.slice(root.length + 1),
    outputTail: output.split(/\r?\n/).slice(-80).join('\n')
  }
  suites.push(suite)
  process.stdout.write(output)
  if (!suite.ok) throw new Error(`${id} failed with status ${result.status}:\n${suite.outputTail}`)
  return suite
}

const readEvidence = (relativePath) => {
  const path = join(root, relativePath)
  requireCondition(existsSync(path), `Required evidence is missing: ${relativePath}`)
  return JSON.parse(read(path))
}

const writeEvidence = (status) => {
  const evidence = {
    at: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    status,
    manifest: manifest.id,
    appPath,
    appSha256: preflight.appSha256 || null,
    expectedSha256: expectedSha256 || null,
    quick,
    preflight,
    suites,
    error: failure ? normalizeError(failure) : null,
    limitations: manifest.limitations
  }
  writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(`[bazzite-production] ${status}: ${artifactPath}`)
  return evidence
}

try {
  requireCondition(process.platform === 'linux', 'Bazzite production proof requires Linux.')
  requireCondition(appPath && existsSync(appPath), `AppImage does not exist: ${appPath || '<empty>'}`)

  const osRelease = read('/etc/os-release')
  preflight.osRelease = osRelease
  requireCondition(/bazzite/i.test(osRelease), '/etc/os-release does not identify Bazzite.')

  preflight.sessionType = String(process.env.XDG_SESSION_TYPE || '').toLowerCase()
  preflight.waylandDisplay = process.env.WAYLAND_DISPLAY || null
  preflight.desktop = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || null
  requireCondition(/gnome/i.test(String(preflight.desktop || '')), `Expected GNOME desktop, received ${JSON.stringify(preflight.desktop)}`)
  requireCondition(preflight.sessionType === 'wayland', `Expected a real Wayland session, received ${JSON.stringify(preflight.sessionType)}`)
  requireCondition(Boolean(preflight.waylandDisplay), 'WAYLAND_DISPLAY is missing.')

  const selinux = commandText('getenforce')
  preflight.selinux = selinux
  requireCondition(selinux.ok && selinux.stdout === 'Enforcing', `SELinux must be Enforcing: ${JSON.stringify(selinux)}`)

  const portal = commandText('systemctl', ['--user', 'is-active', 'xdg-desktop-portal.service'])
  preflight.desktopPortal = portal
  requireCondition(portal.ok && portal.stdout === 'active', `xdg-desktop-portal.service must be active: ${JSON.stringify(portal)}`)

  const atSpi = commandText('python3', ['-c', "import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi; Atspi.init(); print('AT-SPI ready')"])
  preflight.atSpi = atSpi
  requireCondition(atSpi.ok && atSpi.stdout.includes('AT-SPI ready'), `Python AT-SPI is required for the native Wayland folder picker proof: ${JSON.stringify(atSpi)}`)

  preflight.kernel = commandText('uname', ['-a'])
  preflight.session = process.env.XDG_SESSION_ID
    ? commandText('loginctl', ['show-session', process.env.XDG_SESSION_ID, '-p', 'Type', '-p', 'Desktop', '-p', 'Remote'])
    : { ok: false, status: null, stdout: '', stderr: 'XDG_SESSION_ID is missing', error: null }
  preflight.gpu = commandText('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'])
  preflight.appFilesystem = commandText('findmnt', ['-no', 'FSTYPE,OPTIONS', '--target', appPath])
  preflight.appSha256 = sha256(appPath)
  requireCondition(!expectedSha256 || preflight.appSha256 === expectedSha256, `AppImage SHA-256 mismatch: expected ${expectedSha256}, got ${preflight.appSha256}`)

  const applicationsDirectory = join(homedir(), '.local/share/applications')
  const desktopEntries = existsSync(applicationsDirectory)
    ? readdirSync(applicationsDirectory).filter((name) => name.endsWith('.desktop')).flatMap((name) => {
        const path = join(applicationsDirectory, name)
        const content = read(path)
        return /elephant/i.test(content) && content.includes(appPath) ? [{ name, path, content }] : []
      })
    : []
  preflight.gearLeverDesktopEntries = desktopEntries.map(({ name, path }) => ({ name, path }))
  requireCondition(desktopEntries.length > 0, `No Elephant desktop entry references the exact AppImage; install it through Gear Lever first: ${appPath}`)

  const commonEnv = {
    ELEPHANT_ACCEPTANCE_SKIP_BUILD: '1',
    ELEPHANT_ACCEPTANCE_APP_PATH: appPath,
    ELEPHANT_PACKAGED_APP: appPath,
    ELEPHANT_PACKAGED_FORMAT: 'linux-appimage',
    ELEPHANT_E2E_EXHAUSTIVE_EVIDENCE: '1',
    ELEPHANT_E2E_REQUIRE_NATIVE_PACKAGES: '1',
    APPIMAGE_EXTRACT_AND_RUN: '1'
  }

  runSuite('backend-contract', 'pnpm', ['test:backend:raw'], commonEnv)
  const backend = readEvidence('test-results/trusted/backend-contract/latest.json')
  requireCondition(backend.status === 'PROVEN' && backend.appPath === appPath, 'Backend proof did not prove the exact AppImage.')

  runSuite('frontend-behavior', 'pnpm', ['test:frontend:raw'], commonEnv)
  const frontend = readEvidence('test-results/trusted/frontend-behavior/latest.json')
  requireCondition(frontend.status === 'PROVEN' && frontend.appPath === appPath, 'Frontend proof did not prove the exact AppImage.')

  runSuite('bazzite-packaged-user-journey', 'node', ['build/scripts/run-bazzite-packaged-user-journey.mjs'], commonEnv)
  const journey = readEvidence(manifest.journeyArtifact)
  requireCondition(journey.status === 'PROVEN' && journey.appPath === appPath, 'Bazzite journey did not prove the exact AppImage.')
  const missingScenarios = manifest.requiredJourneyScenarios.filter((id) => !journey.scenarios?.some((scenario) => scenario.id === id && scenario.ok === true))
  requireCondition(missingScenarios.length === 0, `Bazzite journey is missing scenarios: ${JSON.stringify(missingScenarios)}`)

  if (!quick) {
    runSuite('official-addon-acceptance', 'pnpm', ['test:automation:raw'], commonEnv)
    const acceptance = readEvidence('test-results/acceptance/latest.json')
    requireCondition(Boolean(acceptance?.result), 'Official addon acceptance did not report a result.')
    const unexpected = (acceptance.result.logs || []).filter((entry) => String(entry?.level || '').toLowerCase() === 'error')
    requireCondition(unexpected.length === 0, `Official addon acceptance contains unexpected errors: ${JSON.stringify(unexpected.slice(0, 10))}`)
  }

  const journal = commandText('journalctl', ['--since', startedAt.toISOString(), '--no-pager', '-o', 'cat'])
  preflight.selinuxJournal = {
    ok: journal.ok,
    status: journal.status,
    error: journal.error || journal.stderr || null
  }
  requireCondition(journal.ok, `Unable to inspect the journal for SELinux denials: ${JSON.stringify(preflight.selinuxJournal)}`)
  const denials = journal.stdout.split(/\r?\n/).filter((line) => /avc:\s+denied|SELinux is preventing/i.test(line))
  preflight.selinuxDenials = denials
  requireCondition(denials.length === 0, `SELinux denials were observed: ${JSON.stringify(denials.slice(0, 20))}`)

  writeEvidence('PROVEN')
} catch (error) {
  failure = error
  writeEvidence('NOT PROVEN')
  throw error
}
