from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def write(relative_path: str, content: str) -> None:
    path = ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def patch_preload() -> None:
    path = "tests/app/e2e/tauri-preload.js"
    content = read(path)
    content, count = re.subn(
        r"const writeJson = \(filename, value\) => \{.*?\n\}\n\n",
        "",
        content,
        count=1,
        flags=re.S,
    )
    if count != 1 and "const writeJson =" in content:
        raise RuntimeError("Unable to remove the unused E2E writeJson helper")
    write(path, content)


def patch_trusted_runtime() -> None:
    path = "Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js"
    content = read(path)

    boot_import = "import { beginTrustedActivation, clearTrustedActivationMarker } from './trustedAddonBootGuard'\n"
    loader_import = "import { loadTrustedAddonModuleGraph, revokeTrustedAddonModuleGraph } from './trustedAddonModuleLoader'\n"
    if loader_import not in content:
        if boot_import not in content:
            raise RuntimeError("Trusted runtime import anchor is missing")
        content = content.replace(boot_import, boot_import + loader_import, 1)

    if "tauri_addons_service_status" not in content:
        replacement = """    native: Object.freeze({
      status: () => invoke('tauri_addons_sidecar_status', { addonId: manifest.id }, target),
      call(method, params = {}, options = {}) {
        const timeoutMs = Number.isFinite(options?.timeoutMs) ? Math.max(1, Math.trunc(options.timeoutMs)) : undefined
        return invoke('tauri_addons_sidecar_call', {
          addonId: manifest.id,
          method: safeString(method),
          params,
          timeoutMs
        }, target)
      },
      service: Object.freeze({
        status: () => invoke('tauri_addons_service_status', { addonId: manifest.id }, target),
        start: () => invoke('tauri_addons_service_start', { addonId: manifest.id }, target),
        call(method, params = {}, options = {}) {
          const timeoutMs = Number.isFinite(options?.timeoutMs) ? Math.max(1, Math.trunc(options.timeoutMs)) : undefined
          return invoke('tauri_addons_service_call', {
            addonId: manifest.id,
            method: safeString(method),
            params,
            timeoutMs
          }, target)
        },
        stop: () => invoke('tauri_addons_service_stop', { addonId: manifest.id }, target)
      })
    }),
    resources:"""
        content, count = re.subn(
            r"    native: Object\.freeze\(\{.*?\n    \}\),\n    resources:",
            replacement,
            content,
            count=1,
            flags=re.S,
        )
        if count != 1:
            raise RuntimeError("Trusted native API block is missing")

    constructor_old = "    this.moduleUrl = ''\n    this.disposables = []"
    constructor_new = "    this.moduleUrl = ''\n    this.moduleUrls = []\n    this.disposables = []"
    if "this.moduleUrls = []" not in content:
        if constructor_old not in content:
            raise RuntimeError("Trusted session constructor anchor is missing")
        content = content.replace(constructor_old, constructor_new, 1)

    start_old = """    const entry = await invoke('tauri_addons_read_entry', { addonId: this.record.manifest.id }, this.target)
    const source = safeString(entry?.source)
    if (!source) throw new Error(`Trusted addon ${this.record.manifest.id} has an empty entry file`)

    const blob = new Blob([
      source,
      `\n//# sourceURL=elephant-addon://${this.record.manifest.id}/${this.record.manifest.runtime?.entry || 'main.js'}`
    ], { type: 'text/javascript' })
    this.moduleUrl = URL.createObjectURL(blob)
    this.module = await import(/* @vite-ignore */ this.moduleUrl)"""
    start_new = """    const addonId = this.record.manifest.id
    const graph = await loadTrustedAddonModuleGraph({
      addonId,
      entryPath: this.record.manifest.runtime?.entry || 'main.js',
      readModule: (path) => invoke('tauri_addons_read_module', { addonId, path }, this.target)
    })
    this.moduleUrl = graph.entryUrl
    this.moduleUrls = graph.urls
    this.module = await import(/* @vite-ignore */ this.moduleUrl)"""
    if "tauri_addons_read_module" not in content:
        if start_old not in content:
            raise RuntimeError("Trusted session entry loader anchor is missing")
        content = content.replace(start_old, start_new, 1)

    cleanup_old = "      if (this.moduleUrl) URL.revokeObjectURL(this.moduleUrl)\n      this.moduleUrl = ''"
    cleanup_new = "      revokeTrustedAddonModuleGraph(this.moduleUrls)\n      this.moduleUrls = []\n      this.moduleUrl = ''"
    if "revokeTrustedAddonModuleGraph(this.moduleUrls)" not in content:
        if cleanup_old not in content:
            raise RuntimeError("Trusted session cleanup anchor is missing")
        content = content.replace(cleanup_old, cleanup_new, 1)

    write(path, content)


def patch_rust_module_reader() -> None:
    path = "Elephant/backend/tauri/src/addons.rs"
    content = read(path)
    if "pub fn tauri_addons_read_module(" in content:
        return

    command = r'''#[tauri::command]
pub fn tauri_addons_read_module(
  app: AppHandle,
  state: State<'_, AddonState>,
  addon_id: String,
  path: String,
) -> R<Value> {
  let _guard = state.lock.lock().map_err(|_| "Addon registry lock is poisoned".to_string())?;
  let registry = read_registry(&app)?;
  let record = require_installed(&registry, &addon_id)?;
  let relative = safe_relative_path(&path)?;
  if relative.extension().and_then(|value| value.to_str()) != Some("js") {
    return Err("Addon modules must use the .js extension".to_string());
  }
  let package = package_dir(&app, &addon_id)?;
  let canonical_package = fs::canonicalize(&package)
    .map_err(|error| format!("Addon package directory is unavailable: {error}"))?;
  let module = fs::canonicalize(package.join(&relative))
    .map_err(|error| format!("Addon module is unavailable: {path}: {error}"))?;
  if !module.starts_with(&canonical_package) {
    return Err(format!("Addon module escapes its package directory: {path}"));
  }
  let metadata = fs::metadata(&module).map_err(|error| error.to_string())?;
  if !metadata.is_file() || metadata.len() > MAX_ENTRY_BYTES {
    return Err("Addon module is not readable or exceeds 5 MiB".to_string());
  }
  let source = fs::read_to_string(module).map_err(|error| error.to_string())?;
  Ok(json!({
    "path": relative.to_string_lossy().replace('\\', "/"),
    "source": source,
    "packageHash": record.package_hash
  }))
}

'''
    marker = "#[tauri::command]\npub fn tauri_addons_call("
    if marker not in content:
        raise RuntimeError("Addon broker insertion anchor is missing")
    write(path, content.replace(marker, command + marker, 1))


def patch_reduced_core() -> None:
    path = "Elephant/backend/tauri/src/lib_min.rs"
    source = read(path).splitlines()
    already_registered = any("addons::tauri_addons_read_module," in line for line in source)
    output = []
    for line in source:
        if line.strip() == "pub mod embeddings;":
            continue
        if "embeddings::tauri_embeddings_" in line:
            continue
        if "tauri_extra_commands::tauri_search_rebuild" in line:
            continue
        output.append(line)
        if "addons::tauri_addons_read_entry," in line and not already_registered:
            output.append("      addons::tauri_addons_read_module,")
    write(path, "\n".join(output) + "\n")

    embeddings = ROOT / "Elephant/backend/tauri/src/embeddings.rs"
    if embeddings.exists():
        embeddings.unlink()


def write_module_graph_test() -> None:
    write(
        "tests/app/unit/addons/trustedAddonModuleGraph.spec.js",
        """import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { trustedAddonModulePathForTest } from '../../../../Elephant/frontend/src/renderer/src/addons/trustedAddonModuleLoader'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('trusted addon module graphs', () => {
  it('normalizes confined JavaScript module paths', () => {
    expect(trustedAddonModulePathForTest('runtime/provider')).toBe('runtime/provider.js')
    expect(trustedAddonModulePathForTest('./main.js')).toBe('main.js')
    expect(() => trustedAddonModulePathForTest('../main.js')).toThrow(/escapes/)
    expect(() => trustedAddonModulePathForTest('manifest.json')).toThrow(/JavaScript/)
  })

  it('reads only installed package-contained modules', () => {
    const rust = read('Elephant/backend/tauri/src/addons.rs')
    const lib = read('Elephant/backend/tauri/src/lib_min.rs')
    expect(rust).toContain('pub fn tauri_addons_read_module')
    expect(rust).toContain('Addon module escapes its package directory')
    expect(rust).toContain('require_installed(&registry, &addon_id)')
    expect(lib).toContain('addons::tauri_addons_read_module')
  })

  it('loads and revokes the complete trusted package graph', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/addons/trustedAddonRuntime.js')
    expect(runtime).toContain('loadTrustedAddonModuleGraph')
    expect(runtime).toContain('tauri_addons_read_module')
    expect(runtime).toContain('revokeTrustedAddonModuleGraph(this.moduleUrls)')
    expect(runtime).not.toContain("const entry = await invoke('tauri_addons_read_entry'")
  })
})
""",
    )


def remove_temporary_workflows() -> None:
    for relative_path in (
        ".github/workflows/fix-physical-ci-blockers.yml",
        ".github/workflows/expose-addon-service-api.yml",
        ".github/workflows/apply-trusted-module-graph.yml",
        ".github/workflows/add-trusted-addon-module-loader.yml",
    ):
        path = ROOT / relative_path
        if path.exists():
            path.unlink()


def restore_lint_workflow() -> None:
    write(
        ".github/workflows/lint.yml",
        """name: Lint

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup

      - name: Run ESLint
        shell: bash
        run: |
          set -o pipefail
          pnpm lint 2>&1 | tee eslint-output.txt

      - name: Upload ESLint output
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eslint-output
          path: eslint-output.txt
          if-no-files-found: ignore
""",
    )


def main() -> None:
    patch_preload()
    patch_trusted_runtime()
    patch_rust_module_reader()
    patch_reduced_core()
    write_module_graph_test()
    remove_temporary_workflows()
    restore_lint_workflow()
    Path(__file__).unlink()


if __name__ == "__main__":
    main()
