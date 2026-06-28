import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '../..')
const bundleRoot = resolve(root, 'Elephant/backend/tauri/target/release/bundle/macos')
const timeoutMs = Number.parseInt(process.env.TAURI_MACOS_SMOKE_TIMEOUT_MS || '90000', 10)
const pollMs = Number.parseInt(process.env.TAURI_MACOS_SMOKE_POLL_MS || '2000', 10)

const fail = (message) => {
  console.error(`[tauri-macos-smoke] ${message}`)
  process.exit(1)
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: 'utf8',
  timeout: 20000,
  ...options
})

const appleScriptString = value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

const readPlistValue = (plistPath, key) => {
  const result = run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath])
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

const findAppBundle = () => {
  if (process.env.TAURI_APP_BUNDLE) return resolve(process.env.TAURI_APP_BUNDLE)

  if (!existsSync(bundleRoot)) {
    fail(`missing macOS bundle directory: ${bundleRoot}`)
  }

  const candidates = readdirSync(bundleRoot)
    .filter(entry => entry.endsWith('.app'))
    .map(entry => join(bundleRoot, entry))

  if (candidates.length === 0) {
    fail(`no .app bundle found in ${bundleRoot}`)
  }

  const preferred = candidates.find(candidate => basename(candidate) === 'Elephant.app')
  return preferred || candidates[0]
}

const processIsRunning = (executableName, executablePath) => {
  const byName = run('/usr/bin/pgrep', ['-x', executableName])
  if (byName.status === 0 && byName.stdout.trim()) return true

  const byPath = run('/usr/bin/pgrep', ['-f', executablePath])
  return byPath.status === 0 && Boolean(byPath.stdout.trim())
}

const countWindowsWithAppleScript = (processName) => {
  const script = `
tell application "System Events"
  set targetName to ${appleScriptString(processName)}
  set matchingProcesses to application processes whose name is targetName
  if (count of matchingProcesses) is 0 then return "0"
  set targetProcess to first item of matchingProcesses
  return ((count of windows of targetProcess) as text)
end tell
`
  const result = run('/usr/bin/osascript', ['-e', script])
  if (result.status !== 0) return null
  const count = Number.parseInt(result.stdout.trim(), 10)
  return Number.isFinite(count) ? count : null
}

const swiftWindowProbePath = () => {
  const dir = join(tmpdir(), 'elephantnote-tauri-smoke')
  mkdirSync(dir, { recursive: true })
  const scriptPath = join(dir, 'count-visible-windows.swift')
  writeFileSync(scriptPath, `
import CoreGraphics
import Foundation

let ownerName = CommandLine.arguments.dropFirst().first ?? ""

func number(_ value: Any?) -> Double {
  if let number = value as? NSNumber { return number.doubleValue }
  if let double = value as? Double { return double }
  if let int = value as? Int { return Double(int) }
  return 0
}

guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
  print("0")
  exit(0)
}

let count = windows.filter { window in
  let owner = window[kCGWindowOwnerName as String] as? String ?? ""
  let layer = Int(number(window[kCGWindowLayer as String]))
  guard owner == ownerName && layer == 0 else { return false }

  guard let bounds = window[kCGWindowBounds as String] as? [String: Any] else { return false }
  let width = number(bounds["Width"])
  let height = number(bounds["Height"])
  return width > 100 && height > 100
}.count

print(count)
`)
  return scriptPath
}

let cachedSwiftProbePath = null
const countWindowsWithCoreGraphics = (processName) => {
  if (!existsSync('/usr/bin/swift')) return null
  cachedSwiftProbePath ||= swiftWindowProbePath()
  const result = run('/usr/bin/swift', [cachedSwiftProbePath, processName], { timeout: 30000 })
  if (result.status !== 0) return null
  const count = Number.parseInt(result.stdout.trim(), 10)
  return Number.isFinite(count) ? count : null
}

const quitApplication = (bundleName, executableName) => {
  for (const target of [bundleName, executableName]) {
    if (!target) continue
    run('/usr/bin/osascript', ['-e', `tell application ${appleScriptString(target)} to quit`], { timeout: 5000 })
  }
}

const diagnostics = (executableName, executablePath) => {
  const ps = run('/bin/ps', ['-axo', 'pid,comm,args'])
  const matchingProcesses = ps.stdout
    .split('\n')
    .filter(line => line.includes(executableName) || line.includes(executablePath))
    .join('\n')

  return [
    'matching processes:',
    matchingProcesses || '<none>',
    '',
    'bundle root:',
    bundleRoot
  ].join('\n')
}

if (process.platform !== 'darwin') {
  fail(`this smoke test must run on macOS, got ${process.platform}`)
}

const appBundle = findAppBundle()
const infoPlist = join(appBundle, 'Contents/Info.plist')
if (!existsSync(infoPlist)) fail(`missing Info.plist in ${appBundle}`)

const executableName = readPlistValue(infoPlist, 'CFBundleExecutable') || basename(appBundle, '.app')
const bundleName = readPlistValue(infoPlist, 'CFBundleName') || readPlistValue(infoPlist, 'CFBundleDisplayName') || basename(appBundle, '.app')
const executablePath = join(appBundle, 'Contents/MacOS', executableName)
if (!existsSync(executablePath)) fail(`missing app executable: ${executablePath}`)

console.log(`[tauri-macos-smoke] launching packaged app: ${appBundle}`)
console.log(`[tauri-macos-smoke] executable: ${executablePath}`)

quitApplication(bundleName, executableName)

const launchResult = run('/usr/bin/open', ['-n', appBundle], { timeout: 30000 })
if (launchResult.status !== 0) {
  console.error(launchResult.stderr || launchResult.stdout)
  fail('macOS could not launch the packaged .app bundle')
}

const deadline = Date.now() + timeoutMs
let lastProbe = '<not started>'
let opened = false

try {
  while (Date.now() < deadline) {
    const running = processIsRunning(executableName, executablePath)
    const appleWindowCount = countWindowsWithAppleScript(executableName)
    const coreGraphicsWindowCount = countWindowsWithCoreGraphics(executableName)
    lastProbe = `running=${running} appleScriptWindows=${appleWindowCount ?? 'unavailable'} coreGraphicsWindows=${coreGraphicsWindowCount ?? 'unavailable'}`
    console.log(`[tauri-macos-smoke] probe: ${lastProbe}`)

    if (running && ((appleWindowCount ?? 0) > 0 || (coreGraphicsWindowCount ?? 0) > 0)) {
      opened = true
      break
    }

    await sleep(pollMs)
  }
} finally {
  quitApplication(bundleName, executableName)
}

if (!opened) {
  console.error(diagnostics(executableName, executablePath))
  fail(`packaged Tauri app did not expose a visible macOS window within ${timeoutMs}ms; last probe: ${lastProbe}`)
}

console.log('[tauri-macos-smoke] packaged Tauri app opened a visible macOS window')
