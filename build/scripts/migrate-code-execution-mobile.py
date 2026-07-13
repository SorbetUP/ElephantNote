#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"missing migration marker in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


def replace_pattern(path: Path, pattern: str, replacement: str) -> None:
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"expected one regex replacement in {path}, got {count}: {pattern[:100]}")
    path.write_text(updated)


def migrate_renderer() -> None:
    path = ROOT / "addons/official/code-execution/main.js"
    replace_once(
        path,
        '''    this.observer = null
    this.config = defaultConfig()
''',
        '''    this.observer = null
    this.config = defaultConfig()
    this.nativeAvailable = true
    this.runningWorkers = new Map()
''',
    )

    replacement = r'''  isJavaScriptLanguage(language) {
    return language === 'javascript'
  }

  runJavaScriptWorker(block, code) {
    const outputLineLimit = this.config.outputLineLimit
    const workerSource = `
      const __lines = [];
      const __limit = ${outputLineLimit};
      const __format = (value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack || value.message;
        try { return JSON.stringify(value); } catch (_) { return String(value); }
      };
      const __write = (...values) => {
        if (__lines.length >= __limit) return;
        __lines.push(values.map(__format).join(' '));
      };
      self.console = Object.freeze({
        log: __write,
        info: __write,
        warn: __write,
        error: __write,
        debug: __write
      });
      self.onmessage = async () => {
        try {
          const __result = await (async () => {
${code}
          })();
          if (__result !== undefined) __write(__result);
          self.postMessage({ ok: true, stdout: __lines.join('\\n'), stderr: '', code: 0 });
        } catch (error) {
          self.postMessage({
            ok: false,
            stdout: __lines.join('\\n'),
            stderr: error && (error.stack || error.message) ? (error.stack || error.message) : String(error),
            code: 1
          });
        }
      };
    `
    const blob = new Blob([workerSource], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url, { name: 'elephant-code-execution' })
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.window.clearTimeout(timer)
        this.runningWorkers.delete(block)
        worker.terminate()
        URL.revokeObjectURL(url)
      }
      const timer = this.window.setTimeout(() => {
        cleanup()
        reject(new Error('JavaScript execution timed out after 30 seconds.'))
      }, 30000)
      this.runningWorkers.set(block, { worker, cleanup })
      worker.onmessage = (event) => {
        const result = event?.data || {}
        cleanup()
        resolve(result)
      }
      worker.onerror = (event) => {
        cleanup()
        reject(new Error(event?.message || 'JavaScript worker failed.'))
      }
      worker.postMessage({ run: true })
    })
  }

  stopBlock(block, output) {
    const running = this.runningWorkers.get(block)
    if (!running) return false
    running.cleanup()
    output.hidden = false
    output.textContent = 'Execution stopped.'
    output.dataset.exitCode = 'stopped'
    return true
  }

  renderExecutionResult(result, output) {
    const stdout = String(result?.stdout || '')
    const stderr = String(result?.stderr || '')
    output.textContent = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '') || `Exited with code ${result?.code ?? 0}`
    output.dataset.exitCode = String(result?.code ?? 0)
    if (!this.config.retainOutput) {
      this.window.setTimeout(() => {
        output.hidden = true
        output.textContent = ''
      }, 2500)
    }
  }

  async runBlock(block, button, output) {
    if (this.stopBlock(block, output)) {
      button.textContent = 'Run'
      return
    }

    const language = this.getLanguage(block)
    const interpreter = this.resolveInterpreter(language)
    const code = this.getCode(block)
    if (!code) return
    if (!interpreter?.executable && !this.isJavaScriptLanguage(language)) {
      output.hidden = false
      output.textContent = `No interpreter is configured for ${language}.`
      output.dataset.exitCode = 'configuration-error'
      return
    }

    button.textContent = 'Stop'
    output.hidden = false
    output.textContent = `Running ${interpreter?.label || language}…`
    try {
      let result
      if (!this.nativeAvailable && this.isJavaScriptLanguage(language)) {
        result = await this.runJavaScriptWorker(block, code)
      } else {
        try {
          result = await this.api.native.call('execute', {
            executable: interpreter.executable,
            args: interpreter.args,
            code,
            cwd: '',
            outputLineLimit: this.config.outputLineLimit
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const nativeUnavailable = /not supported|not granted|no sidecar|unavailable|host adapter/i.test(message)
          if (!nativeUnavailable || !this.isJavaScriptLanguage(language)) throw error
          this.nativeAvailable = false
          result = await this.runJavaScriptWorker(block, code)
        }
      }
      this.renderExecutionResult(result, output)
    } catch (error) {
      output.textContent = error instanceof Error ? error.message : String(error)
      output.dataset.exitCode = 'error'
    } finally {
      button.textContent = 'Run'
    }
  }

  decorateBlock'''
    replace_pattern(path, r"  async runBlock\(block, button, output\) \{.*?\n  \}\n\n  decorateBlock", replacement)

    replace_once(
        path,
        '''  async onload(api) {
    await this.loadConfig()
''',
        '''  async onload(api) {
    await this.loadConfig()
    const nativeStatus = await api.native.status().catch(() => null)
    this.nativeAvailable = nativeStatus?.available === true
''',
    )
    replace_once(
        path,
        "description: 'Configure retained output and package-owned interpreters.',",
        "description: 'Configure retained output and interpreters. JavaScript runs in a local Worker on Android and iOS.',",
    )
    replace_once(
        path,
        '''  onunload() {
    this.observer?.disconnect()
''',
        '''  onunload() {
    for (const running of this.runningWorkers.values()) running.cleanup()
    this.runningWorkers.clear()
    this.observer?.disconnect()
''',
    )


def write_mobile_builder() -> None:
    path = ROOT / "build/scripts/build-mobile-addon-package.mjs"
    path.write_text(r'''import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(__filename), '../..')
const mobilePlatforms = new Set(['android-aarch64', 'android-x86_64', 'ios-aarch64', 'ios-x86_64'])

const fail = (message) => {
  console.error(`[mobile-addon] ${message}`)
  process.exit(1)
}

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) fail(`${command} exited with ${result.status}`)
  return String(result.stdout || '').trim()
}

const addonArg = process.argv[2]
const platform = String(process.argv[3] || '').trim()
if (!addonArg || !mobilePlatforms.has(platform)) {
  fail('usage: node build/scripts/build-mobile-addon-package.mjs <addon-directory> <android-aarch64|android-x86_64|ios-aarch64|ios-x86_64>')
}

const addonDir = resolve(repoRoot, addonArg)
const manifestPath = join(addonDir, 'manifest.json')
if (!existsSync(manifestPath)) fail(`missing ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.id !== 'elephant.code-execution') fail('only the Code execution mobile package is currently supported')

const mobileManifest = structuredClone(manifest)
if (mobileManifest.permissions) delete mobileManifest.permissions.native
delete mobileManifest.native
mobileManifest.description = 'Runs JavaScript code blocks in an isolated Web Worker on Android and iOS.'
mobileManifest.mobileRuntime = { kind: 'web-worker', platform }

const safeId = String(manifest.id).replace(/[^a-z0-9._-]/gi, '-')
const stagingDir = resolve(repoRoot, 'build/out/addons/mobile-staging', `${safeId}-${platform}`)
const releaseDir = resolve(repoRoot, 'build/out/addons/releases', safeId)
rmSync(stagingDir, { recursive: true, force: true })
mkdirSync(stagingDir, { recursive: true })
mkdirSync(releaseDir, { recursive: true })
writeFileSync(join(stagingDir, 'manifest.json'), `${JSON.stringify(mobileManifest, null, 2)}\n`)
cpSync(join(addonDir, manifest.runtime.entry), join(stagingDir, manifest.runtime.entry))
if (existsSync(join(addonDir, 'assets'))) cpSync(join(addonDir, 'assets'), join(stagingDir, 'assets'), { recursive: true })

const outputName = `${safeId}-${manifest.version}-${platform}.enaddon`
const outputPath = join(releaseDir, outputName)
const stdout = run('cargo', [
  'run', '--quiet',
  '--manifest-path', resolve(repoRoot, 'build/tools/enaddon-packager/Cargo.toml'),
  '--', stagingDir, outputPath
])
const metadata = JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1))
writeFileSync(`${outputPath}.json`, `${JSON.stringify({
  ...metadata,
  id: manifest.id,
  version: manifest.version,
  platform,
  file: outputName,
  catalogPath: `addons/${basename(addonDir)}/releases/${outputName}`,
  runtime: 'web-worker'
}, null, 2)}\n`)
console.log(`[mobile-addon] package=${outputPath}`)
console.log(`[mobile-addon] blake3=${metadata.blake3}`)
''')


def migrate_publisher() -> None:
    path = ROOT / ".github/workflows/publish-native-addon-packages.yml"
    text = path.read_text()
    text = text.replace(
        "  publish-catalog:\n    needs: build-native-packages\n",
        '''  build-mobile-code-execution:
    name: Build Code execution ${{ matrix.platform }}
    strategy:
      fail-fast: false
      matrix:
        platform: [android-aarch64, android-x86_64, ios-aarch64, ios-x86_64]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: feature/physical-addon-packages

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Package mobile Web Worker runtime
        run: node build/scripts/build-mobile-addon-package.mjs addons/official/code-execution "${{ matrix.platform }}"

      - name: Upload mobile package
        uses: actions/upload-artifact@v4
        with:
          name: mobile-addon-package-${{ matrix.platform }}
          path: build/out/addons/releases/**
          if-no-files-found: error
          retention-days: 14

  publish-catalog:
    needs: [build-native-packages, build-mobile-code-execution]
''',
    )
    text = text.replace(
        "          pattern: native-addon-packages-*",
        "          pattern: '*-addon-package*'",
    )
    text = text.replace(
        "          required_ids = {'elephant.ai-ocr', 'elephant.code-execution'}\n          required_platforms = {'linux-x86_64', 'windows-x86_64', 'macos-x86_64', 'macos-aarch64'}\n          expected = {(addon_id, platform) for addon_id in required_ids for platform in required_platforms}",
        "          desktop_platforms = {'linux-x86_64', 'windows-x86_64', 'macos-x86_64', 'macos-aarch64'}\n          mobile_platforms = {'android-aarch64', 'android-x86_64', 'ios-aarch64', 'ios-x86_64'}\n          expected = ({('elephant.ai-ocr', platform) for platform in desktop_platforms}\n                      | {('elephant.code-execution', platform) for platform in desktop_platforms | mobile_platforms})",
    )
    path.write_text(text)


def migrate_catalog_visibility() -> None:
    path = ROOT / "Elephant/backend/tauri/src/addon_catalog.rs"
    replace_once(
        path,
        '''  #[serde(default)]
  pub official: bool,
  #[serde(default)]
  pub manifest_path: String,''',
        '''  #[serde(default)]
  pub official: bool,
  #[serde(default)]
  pub requires_platform_package: bool,
  #[serde(default)]
  pub manifest_path: String,''',
    )
    text = path.read_text()
    text = text.replace(
        '''    official: false,
    manifest_path: "bundled/trusted-workspace-lab/manifest.json".to_string(),''',
        '''    official: false,
    requires_platform_package: false,
    manifest_path: "bundled/trusted-workspace-lab/manifest.json".to_string(),''',
    )
    text = text.replace(
        '''      official: false,
      manifest_path: "addons/test/manifest.json".to_string(),''',
        '''      official: false,
      requires_platform_package: false,
      manifest_path: "addons/test/manifest.json".to_string(),''',
    )
    text = text.replace(
        '''      official: true,
      manifest_path: String::new(),''',
        '''      official: true,
      requires_platform_package: true,
      manifest_path: String::new(),''',
        1,
    )
    path.write_text(text)
    replace_once(
        path,
        '''  let expected_prefix = format!("addons/{}/", item.slug);
  if !item.packages.is_empty() {''',
        '''  let expected_prefix = format!("addons/{}/", item.slug);
  if item.requires_platform_package && item.packages.is_empty() {
    return Err(format!("Catalogue addon {} requires at least one platform package", item.id));
  }
  if !item.packages.is_empty() {''',
    )
    replace_once(
        path,
        '''pub fn tauri_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  let mut addons = fetch_catalog()?.addons;
  if !addons.iter().any(|item| item.id == BUNDLED_TRUSTED_LAB_ID) {''',
        '''pub fn tauri_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  let platform = platform_key();
  let mut addons = fetch_catalog()?.addons;
  addons.retain(|item| !item.requires_platform_package || item.packages.contains_key(&platform));
  if !addons.iter().any(|item| item.id == BUNDLED_TRUSTED_LAB_ID) {''',
    )


def main() -> None:
    migrate_renderer()
    write_mobile_builder()
    migrate_publisher()
    migrate_catalog_visibility()
    print("Code execution mobile migration applied")


if __name__ == "__main__":
    main()
