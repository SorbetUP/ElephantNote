from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one occurrence, found {count}")
    path.write_text(text.replace(old, new, 1))


# Build-time Codex runtime bundler.
ensure_codex = r'''import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const binDir = join(root, 'Elephant/backend/tauri', 'bin')
const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex'
const targetPath = join(binDir, binaryName)
const manifestPath = join(binDir, 'codex-runtime.json')
const repository = 'openai/codex'
const releaseTag = process.env.ELEPHANTNOTE_CODEX_RELEASE || 'rust-v0.144.1'
const maxAssetBytes = 256 * 1024 * 1024

const log = (...args) => console.log('[tauri-codex]', ...args)

if (process.env.ELEPHANTNOTE_SKIP_CODEX_BUNDLE === '1') {
  log('skip requested through ELEPHANTNOTE_SKIP_CODEX_BUNDLE=1')
  process.exit(0)
}

const run = (path, args) => spawnSync(path, args, { encoding: 'utf8', windowsHide: true })

const runtimeIsUsable = (path) => {
  if (!existsSync(path)) return false
  const version = run(path, ['--version'])
  if (version.status !== 0) return false
  const help = run(path, ['app-server', '--help'])
  const output = `${help.stdout || ''}\n${help.stderr || ''}`.toLowerCase()
  return help.status === 0 && output.includes('app-server') && (output.includes('--listen') || output.includes('stdio'))
}

const readManifest = () => {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

const existing = readManifest()
if (runtimeIsUsable(targetPath) && existing?.release === releaseTag && existing?.platform === process.platform && existing?.arch === process.arch) {
  log(`already bundled: ${targetPath} (${releaseTag})`)
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })

const requestJson = async(url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'ElephantNote Codex runtime bundler',
      'x-github-api-version': '2022-11-28'
    }
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

const download = async(url, destination) => {
  const response = await fetch(url, { headers: { 'user-agent': 'ElephantNote Codex runtime bundler' } })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  if (!response.body) throw new Error('download response body is empty')
  await new Promise((resolvePromise, reject) => {
    const file = createWriteStream(destination)
    file.on('error', reject)
    response.body.pipeTo(new WritableStream({
      write(chunk) { file.write(Buffer.from(chunk)) },
      close() { file.end(resolvePromise) },
      abort(error) { file.destroy(); reject(error) }
    })).catch(reject)
  })
}

const platformTokens = {
  darwin: ['apple-darwin', 'darwin'],
  linux: ['unknown-linux-musl', 'linux'],
  win32: ['pc-windows-msvc', 'windows']
}[process.platform] || []

const archTokens = {
  arm64: ['aarch64', 'arm64'],
  x64: ['x86_64', 'x64']
}[process.arch] || []

const scoreAsset = (asset) => {
  const name = String(asset.name || '').toLowerCase()
  if (!name.startsWith('codex-')) return -1000
  if (!name.endsWith('.tar.gz') && !name.endsWith('.zip')) return -1000
  if (name.includes('desktop') || name.includes('source') || name.includes('sandbox')) return -1000
  let score = 0
  if (platformTokens.some((token) => name.includes(token))) score += 100
  if (archTokens.some((token) => name.includes(token))) score += 80
  if (process.platform === 'linux' && name.includes('musl')) score += 20
  if (name.endsWith('.zip')) score += 3
  return score
}

const extractArchive = (archive, destination) => {
  mkdirSync(destination, { recursive: true })
  if (archive.toLowerCase().endsWith('.zip')) {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force ${JSON.stringify(archive)} ${JSON.stringify(destination)}`], { stdio: 'inherit' })
      if (result.status !== 0) throw new Error('PowerShell Expand-Archive failed')
      return
    }
    const result = spawnSync('unzip', ['-q', archive, '-d', destination], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error('unzip failed')
    return
  }
  const result = spawnSync('tar', ['-xzf', archive, '-C', destination], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('tar extraction failed')
}

const binaryScore = (path) => {
  const name = basename(path).toLowerCase().replace(/\.exe$/, '')
  if (name === 'codex') return 100
  if (name.startsWith('codex-') && !name.includes('sandbox') && !name.includes('proxy')) return 50
  return 0
}

const findBinary = (dir) => {
  let best = null
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      const nested = findBinary(path)
      if (nested && (!best || nested.score > best.score)) best = nested
      continue
    }
    const score = binaryScore(path)
    if (score > 0 && (!best || score > best.score)) best = { path, score }
  }
  return best
}

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const main = async() => {
  if (!platformTokens.length || !archTokens.length) {
    throw new Error(`Unsupported Codex bundle target ${process.platform}/${process.arch}`)
  }
  const release = await requestJson(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`)
  const ranked = [...(release.assets || [])]
    .map((asset) => ({ asset, score: scoreAsset(asset) }))
    .filter((entry) => entry.score > 0 && entry.asset.size > 0 && entry.asset.size <= maxAssetBytes)
    .sort((a, b) => b.score - a.score)
  const selected = ranked[0]?.asset
  if (!selected) throw new Error(`No Codex release asset matches ${process.platform}/${process.arch} in ${releaseTag}`)

  const expectedDigest = String(selected.digest || '').replace(/^sha256:/, '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error(`Release asset ${selected.name} has no valid SHA-256 digest`)

  const workDir = join(tmpdir(), `elephantnote-codex-${process.pid}-${Date.now()}`)
  const archive = join(workDir, selected.name)
  const extractDir = join(workDir, 'extract')
  mkdirSync(workDir, { recursive: true })
  try {
    log(`downloading ${releaseTag}/${selected.name} (${selected.size} bytes)`)
    await download(selected.browser_download_url, archive)
    const actualDigest = sha256File(archive)
    if (actualDigest !== expectedDigest) throw new Error(`SHA-256 mismatch for ${selected.name}`)
    extractArchive(archive, extractDir)
    const extracted = findBinary(extractDir)
    if (!extracted) throw new Error('Codex executable was not found in the release archive')
    copyFileSync(extracted.path, targetPath)
    if (process.platform !== 'win32') chmodSync(targetPath, 0o755)
    if (!runtimeIsUsable(targetPath)) throw new Error('Bundled Codex executable does not expose a working app-server')
    const versionResult = run(targetPath, ['--version'])
    const version = String(versionResult.stdout || versionResult.stderr || '').trim()
    writeFileSync(manifestPath, `${JSON.stringify({
      repository,
      release: releaseTag,
      asset: selected.name,
      sha256: actualDigest,
      version,
      platform: process.platform,
      arch: process.arch
    }, null, 2)}\n`)
    log(`bundled ${version} at ${targetPath}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[tauri-codex]', error?.stack || error?.message || String(error))
  process.exit(1)
})
'''
(ROOT / 'build/scripts/ensure-tauri-codex-runtime.mjs').write_text(ensure_codex)

# Rate-limit normalization kept independent from Vue for unit testing.
rate_limits_helper = r'''const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
const approximately = (value, target) => Math.abs(value - target) <= target * 0.05

export const formatCodexWindowLabel = (window, isSecondary = false) => {
  const minutes = Number(window?.windowDurationMins)
  if (Number.isFinite(minutes) && minutes > 0) {
    if (approximately(minutes, 5 * 60)) return '5-hour limit'
    if (approximately(minutes, 24 * 60)) return 'Daily limit'
    if (approximately(minutes, 7 * 24 * 60)) return 'Weekly limit'
    if (approximately(minutes, 30 * 24 * 60)) return 'Monthly limit'
    if (minutes % (24 * 60) === 0) return `${Math.round(minutes / (24 * 60))}-day limit`
    if (minutes % 60 === 0) return `${Math.round(minutes / 60)}-hour limit`
    return `${minutes}-minute limit`
  }
  return isSecondary ? 'Secondary usage limit' : 'Usage limit'
}

const snapshotsFromPayload = (payload = {}) => {
  const byId = payload?.rateLimitsByLimitId
  const entries = byId && typeof byId === 'object' && !Array.isArray(byId)
    ? Object.entries(byId).filter(([, snapshot]) => snapshot && typeof snapshot === 'object')
    : []
  entries.sort(([left], [right]) => {
    if (left === 'codex') return -1
    if (right === 'codex') return 1
    return left.localeCompare(right)
  })
  if (entries.length) return entries
  const fallback = payload?.rateLimits
  return fallback && typeof fallback === 'object' ? [[fallback.limitId || 'codex', fallback]] : []
}

export const buildCodexRateLimitRows = (payload = {}) => {
  const snapshots = snapshotsFromPayload(payload)
  const showBucket = snapshots.length > 1
  return snapshots.flatMap(([bucketId, snapshot]) => {
    const bucketLabel = snapshot.limitName || bucketId
    return ['primary', 'secondary'].flatMap((kind, index) => {
      const window = snapshot?.[kind]
      if (!window || typeof window !== 'object') return []
      const usedPercent = clampPercent(window.usedPercent)
      return [{
        id: `${bucketId}-${kind}`,
        label: formatCodexWindowLabel(window, index === 1),
        bucketLabel: showBucket && bucketLabel !== 'codex' ? bucketLabel : '',
        usedPercent,
        remainingPercent: 100 - usedPercent,
        resetsAt: Number.isFinite(Number(window.resetsAt)) ? Number(window.resetsAt) : null,
        windowDurationMins: Number.isFinite(Number(window.windowDurationMins)) ? Number(window.windowDurationMins) : null
      }]
    })
  })
}
'''
(ROOT / 'Elephant/frontend/app/components/settings/codexRateLimits.js').write_text(rate_limits_helper)

rate_limits_test = r'''import { describe, expect, it } from 'vitest'
import { buildCodexRateLimitRows, formatCodexWindowLabel } from '../../../Elephant/frontend/app/components/settings/codexRateLimits'

describe('Codex rate-limit display', () => {
  it('shows both the short and weekly subscription windows', () => {
    const rows = buildCodexRateLimitRows({
      rateLimitsByLimitId: {
        codex: {
          primary: { usedPercent: 41, windowDurationMins: 300, resetsAt: 1000 },
          secondary: { usedPercent: 72, windowDurationMins: 10080, resetsAt: 2000 }
        }
      }
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.label)).toEqual(['5-hour limit', 'Weekly limit'])
    expect(rows.map((row) => row.remainingPercent)).toEqual([59, 28])
  })

  it('uses the backward-compatible snapshot when no bucket map exists', () => {
    const rows = buildCodexRateLimitRows({ rateLimits: { primary: { usedPercent: 10, windowDurationMins: 60 } } })
    expect(rows).toMatchObject([{ label: '1-hour limit', usedPercent: 10, remainingPercent: 90 }])
  })

  it('does not invent weekly labels when the server omits the duration', () => {
    expect(formatCodexWindowLabel({}, true)).toBe('Secondary usage limit')
  })
})
'''
(ROOT / 'tests/app/unit/codexRateLimits.spec.js').write_text(rate_limits_test)

# Package/build integration.
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text())
scripts = package['scripts']
scripts['tauri:codex:install'] = 'node build/scripts/ensure-tauri-codex-runtime.mjs'
scripts['tauri:build'] = 'pnpm tauri:llama:install && pnpm tauri:codex:install && cd Elephant/backend/tauri && cargo tauri build'
scripts['tauri:linux:build'] = 'pnpm tauri:llama:install && pnpm tauri:codex:install && cd Elephant/backend/tauri && cargo tauri build --config tauri.linux.conf.json'
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')

tauri_path = ROOT / 'Elephant/backend/tauri/tauri.conf.json'
tauri = json.loads(tauri_path.read_text())
tauri['build']['beforeBuildCommand'] = 'pnpm tauri:llama:install && pnpm tauri:codex:install && pnpm tauri:web:build'
tauri_path.write_text(json.dumps(tauri, indent=2, ensure_ascii=False) + '\n')

replace_once(
    ROOT / 'build/scripts/build_dev.sh',
    'node build/scripts/ensure-tauri-llama-server.mjs\n',
    'node build/scripts/ensure-tauri-llama-server.mjs\nnode build/scripts/ensure-tauri-codex-runtime.mjs\n',
    'dev runtime preparation',
)

ignore_path = ROOT / '.gitignore'
ignore = ignore_path.read_text()
for line in [
    'Elephant/backend/tauri/bin/codex',
    'Elephant/backend/tauri/bin/codex.exe',
    'Elephant/backend/tauri/bin/codex-runtime.json',
]:
    if line not in ignore.splitlines():
        ignore += f'\n{line}'
ignore_path.write_text(ignore.rstrip() + '\n')

# Remove runtime archive/downloader dependencies: downloads now happen at build time.
cargo_path = ROOT / 'Elephant/backend/tauri/Cargo.toml'
cargo = cargo_path.read_text()
for line in ['flate2 = "1"\n', 'sha2 = "0.10"\n', 'tar = "0.4"\n', 'zip = { version = "2", default-features = false, features = ["deflate"] }\n']:
    cargo = cargo.replace(line, '')
cargo = cargo.replace('features = ["json", "blocking", "rustls-tls", "stream"]', 'features = ["json", "rustls-tls", "stream"]')
cargo_path.write_text(cargo)

# The app exposes the bundled resource path to the runtime resolver.
lib_path = ROOT / 'Elephant/backend/tauri/src/lib_min.rs'
replace_once(
    lib_path,
    'use serde_json::json;\n#[allow(unused_imports)]\nuse tauri::Manager;\n',
    'use serde_json::json;\n#[cfg(not(mobile))]\nuse std::path::{Path, PathBuf};\n#[allow(unused_imports)]\nuse tauri::Manager;\n',
    'lib imports',
)
replace_once(
    lib_path,
    '#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() {\n',
    '''#[cfg(not(mobile))]\nfn codex_binary_name() -> &'static str {\n  if cfg!(windows) { "codex.exe" } else { "codex" }\n}\n\n#[cfg(not(mobile))]\nfn bundled_codex_candidates(resource_dir: Option<&Path>, manifest_dir: &Path) -> Vec<PathBuf> {\n  let mut candidates = Vec::new();\n  if let Some(resource_dir) = resource_dir {\n    candidates.push(resource_dir.join("bin").join(codex_binary_name()));\n    candidates.push(resource_dir.join(codex_binary_name()));\n  }\n  candidates.push(manifest_dir.join("bin").join(codex_binary_name()));\n  candidates\n}\n\n#[cfg(not(mobile))]\nfn configure_bundled_codex_runtime(app: &tauri::App) {\n  let resource_dir = app.path().resource_dir().ok();\n  let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));\n  if let Some(path) = bundled_codex_candidates(resource_dir.as_deref(), manifest_dir)\n    .into_iter()\n    .find(|path| path.is_file())\n  {\n    std::env::set_var("ELEPHANTNOTE_CODEX_PATH", &path);\n    eprintln!("[Codex][bundle] ready path={}", path.display());\n  } else {\n    eprintln!("[Codex][bundle] missing; rebuild with pnpm tauri:codex:install");\n  }\n}\n\n#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() {\n''',
    'bundled runtime helpers',
)
replace_once(
    lib_path,
    '    .setup(|app| {\n      let handle = app.handle().clone();\n',
    '    .setup(|app| {\n      #[cfg(not(mobile))]\n      configure_bundled_codex_runtime(app);\n      let handle = app.handle().clone();\n',
    'setup runtime configuration',
)
replace_once(
    lib_path,
    '  fn platform_info_contains_target_flags() {\n',
    '''  #[cfg(not(mobile))]\n  #[test]\n  fn bundled_codex_candidates_prefer_packaged_resources() {\n    let resource = Path::new("/app/resources");\n    let manifest = Path::new("/source/tauri");\n    let candidates = bundled_codex_candidates(Some(resource), manifest);\n    assert_eq!(candidates[0], resource.join("bin").join(codex_binary_name()));\n    assert_eq!(candidates.last(), Some(&manifest.join("bin").join(codex_binary_name())));\n  }\n\n  #[test]\n  fn platform_info_contains_target_flags() {\n''',
    'lib bundled runtime test',
)

# Prefer the build-bundled runtime and remove the runtime network installer.
codex_path = ROOT / 'Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs'
replace_once(codex_path, 'mod codex_runtime_installer;\n\n', '', 'remove runtime installer module')
replace_once(
    codex_path,
    '''    if let Some(runtime) = codex_runtime_installer::existing(app) {\n        push_candidate(&mut out, &mut seen, runtime.path, "elephantnote-managed");\n    }\n    for key in ["ELEPHANTNOTE_CODEX_PATH", "CODEX_PATH"] {''',
    '''    for key in ["ELEPHANTNOTE_CODEX_PATH", "CODEX_PATH"] {''',
    'prefer bundled environment path',
)
replace_once(
    codex_path,
    '''    }\n\n    add_codex_app_candidates(&mut out, &mut seen);''',
    '''    }\n\n    // Preserve compatibility with one previously downloaded runtime, but only after the bundled\n    // binary so application updates always use the version shipped with ElephantNote.\n    if let Ok(app_data_dir) = app.path().app_data_dir() {\n        push_candidate(\n            &mut out,\n            &mut seen,\n            app_data_dir\n                .join("runtimes")\n                .join("codex")\n                .join("bin")\n                .join(binary_name()),\n            "legacy-elephantnote-managed",\n        );\n    }\n\n    add_codex_app_candidates(&mut out, &mut seen);''',
    'legacy managed fallback candidate',
)
replace_once(
    codex_path,
    '''    log(\n        "installer",\n        "no valid app-server runtime found; installing official managed Codex CLI",\n    );\n    let app_clone = app.clone();\n    let installed =\n        tokio::task::spawn_blocking(move || codex_runtime_installer::ensure_installed(app_clone))\n            .await\n            .map_err(|error| format!("Managed Codex installer task failed: {error}"))??;\n    probe_runtime(installed.path, "elephantnote-managed-download".to_string())\n        .await\n        .ok_or_else(|| {\n            "Downloaded Codex binary does not expose the app-server protocol.".to_string()\n        })\n''',
    '''    Err(\n        "The bundled Codex app-server runtime is missing or invalid. Rebuild ElephantNote with `pnpm tauri:codex:install`; ElephantNote no longer downloads a 100 MB runtime while opening AI settings.".to_string(),\n    )\n''',
    'remove lazy runtime download',
)
installer = ROOT / 'Elephant/backend/tauri/src/chat_runtime/codex_app_server/codex_runtime_installer.rs'
installer.unlink()

# Render every real usage window instead of arbitrarily selecting the first primary bucket.
panel = ROOT / 'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'
replace_once(
    panel,
    '''        <div v-if="codexRateLimit" class="en-rate-limit">\n          <span>Usage</span>\n          <progress max="100" :value="codexRateLimit.usedPercent || 0" />\n          <strong>{{ Math.round(codexRateLimit.usedPercent || 0) }}%</strong>\n          <small v-if="codexRateLimit.resetsAt">reset {{ formatReset(codexRateLimit.resetsAt) }}</small>\n        </div>''',
    '''        <div v-if="codexRateLimitRows.length" class="en-rate-limits">\n          <div v-for="limit in codexRateLimitRows" :key="limit.id" class="en-rate-limit">\n            <div class="en-rate-limit-copy">\n              <strong>{{ limit.label }}</strong>\n              <small v-if="limit.bucketLabel">{{ limit.bucketLabel }}</small>\n            </div>\n            <progress max="100" :value="limit.remainingPercent" />\n            <strong>{{ limit.remainingPercent }}% left</strong>\n            <small>{{ limit.usedPercent }}% used</small>\n            <small v-if="limit.resetsAt">resets {{ formatReset(limit.resetsAt) }}</small>\n          </div>\n        </div>''',
    'rate limit template',
)
replace_once(
    panel,
    "import { clonePlainObject } from './settingsModelHelpers'\n",
    "import { clonePlainObject } from './settingsModelHelpers'\nimport { buildCodexRateLimitRows } from './codexRateLimits'\n",
    'rate limit helper import',
)
replace_once(
    panel,
    "const codexAccountLabel = computed(() => codexStatus.value.connected ? `ChatGPT ${codexStatus.value.account?.planType || 'account'}` : codexStatus.value.installed ? 'Codex CLI detected' : 'Codex CLI required')\nconst codexRateLimit = computed(() => codexRateLimits.value?.rateLimits?.primary || Object.values(codexRateLimits.value?.rateLimitsByLimitId || {})[0]?.primary || null)\n",
    "const codexAccountLabel = computed(() => codexStatus.value.connected ? `ChatGPT ${codexStatus.value.account?.planType || 'account'}` : codexStatus.value.installed ? 'Bundled Codex runtime ready' : 'Bundled Codex runtime missing')\nconst codexRateLimitRows = computed(() => buildCodexRateLimitRows(codexRateLimits.value || {}))\n",
    'rate limit computed rows',
)
replace_once(
    panel,
    "        : 'Install the official Codex CLI first.')\n",
    "        : 'The bundled Codex runtime is missing from this build.')\n",
    'bundled runtime status message',
)
replace_once(
    panel,
    '.en-login-challenge, .en-rate-limit { margin: 0 16px 14px; padding: 8px 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }\n.en-login-challenge { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.en-rate-limit progress { flex: 1; min-width: 120px; height: 8px; }\n',
    '.en-login-challenge { margin: 0 16px 14px; padding: 8px 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.en-rate-limits { display: grid; gap: 8px; margin: 0 16px 14px; }\n.en-rate-limit { margin: 0; padding: 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }\n.en-rate-limit-copy { min-width: 120px; display: grid; gap: 2px; }\n.en-rate-limit progress { flex: 1; min-width: 120px; height: 8px; }\n',
    'rate limit styles',
)

print('Codex bundling and rate-limit refactor applied')
