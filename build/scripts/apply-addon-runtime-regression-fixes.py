from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(
            f"{path}: expected {count} occurrence(s), found {actual}: {old[:120]!r}"
        )
    file.write_text(text.replace(old, new, count))


# Persist official provenance in registry.json instead of only changing the returned object.
replace(
    "Elephant/backend/tauri/src/official_addon_catalog.rs",
    """use crate::{
  addon_catalog::CatalogAddon,
  addons::{self, AddonState, InstalledAddon},
};""",
    """use crate::{
  addon_catalog::CatalogAddon,
  addons::{self, AddonState, InstalledAddon},
  vault::config as vault_config,
  vault_layout,
};""",
)
replace(
    "Elephant/backend/tauri/src/official_addon_catalog.rs",
    """#[tauri::command]
pub fn tauri_official_addons_catalog_list() -> R<Vec<CatalogAddon>> {""",
    """fn registry_path(app: &AppHandle) -> R<PathBuf> {
  let vault = vault_config::get_active_vault(app)?;
  Ok(vault_layout::addons_dir(&vault.path).join("registry.json"))
}

fn persist_official_source(app: &AppHandle, addon_id: &str) -> R<()> {
  let path = registry_path(app)?;
  let raw = fs::read_to_string(&path)
    .map_err(|error| format!("Failed to read addon registry: {error}"))?;
  let mut registry: Value = serde_json::from_str(&raw)
    .map_err(|error| format!("Invalid addon registry: {error}"))?;
  let record = registry
    .get_mut("addons")
    .and_then(Value::as_object_mut)
    .and_then(|addons| addons.get_mut(addon_id))
    .and_then(Value::as_object_mut)
    .ok_or_else(|| format!("Installed addon is absent from the registry: {addon_id}"))?;
  record.insert("source".to_string(), Value::String("official".to_string()));
  let encoded = serde_json::to_vec_pretty(&registry).map_err(|error| error.to_string())?;
  let temporary = path.with_extension(format!("json.{}.tmp", chrono::Utc::now().timestamp_millis()));
  fs::write(&temporary, encoded)
    .map_err(|error| format!("Failed to stage addon registry provenance: {error}"))?;
  fs::rename(&temporary, &path)
    .map_err(|error| format!("Failed to persist addon registry provenance: {error}"))
}

#[tauri::command]
pub fn tauri_official_addons_catalog_list() -> R<Vec<CatalogAddon>> {""",
)
replace(
    "Elephant/backend/tauri/src/official_addon_catalog.rs",
    """  let result = addons::tauri_addons_install(app, state, package_path.to_string_lossy().to_string());
  let _ = fs::remove_file(package_path);
  let mut record = result?;
  record.source = "official".to_string();""",
    """  let result = addons::tauri_addons_install(app.clone(), state, package_path.to_string_lossy().to_string());
  let _ = fs::remove_file(package_path);
  let mut record = result?;
  persist_official_source(&app, &record.manifest.id)?;
  record.source = "official".to_string();""",
)

# Reject incomplete native official packages during installation.
replace(
    "Elephant/backend/tauri/src/official_addon_catalog.rs",
    """    if files.contains_key("manifest.json") {
      return Ok(files);
    }""",
    """    if files.contains_key("manifest.json") {
      let manifest: Value = serde_json::from_slice(
        files.get("manifest.json").expect("manifest was just checked"),
      )
      .map_err(|error| format!("Invalid local official addon manifest for {}: {error}", item.id))?;
      if let Some(sidecar) = current_sidecar_path(&manifest) {
        if !files.contains_key(&sidecar) {
          return Err(format!(
            "Official addon native service is not materialized for {}: {}",
            item.id, sidecar
          ));
        }
      }
      return Ok(files);
    }""",
)

# Reconcile historical official installs whose old registry record says external.
replace(
    "Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js",
    "  list: () => invoke('tauri_addons_list'),",
    "  list: () => invoke('tauri_addons_list'),\n  officialList: () => invoke('tauri_official_addons_catalog_list'),",
)
replace(
    "Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js",
    "const runtimeManifest = (record = {}) => ({",
    """export const reconcileOfficialAddonRecords = (records = [], catalogue = []) => {
  const officialIds = new Set(
    catalogue
      .filter((item) => item?.official === true && safeString(item?.id))
      .map((item) => safeString(item.id))
  )
  return records.map((record) => {
    const id = safeString(record?.manifest?.id)
    if (!officialIds.has(id)) return record
    return {
      ...record,
      source: 'official',
      official: true,
      manifest: {
        ...record.manifest,
        source: 'official',
        official: true
      }
    }
  })
}

const runtimeManifest = (record = {}) => ({""",
)
replace(
    "Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js",
    """  async load() {
    const records = await externalAddonApi.list()
    const communityEnabled = await externalAddonApi.getCommunityEnabled()""",
    """  async load() {
    const installedRecords = await externalAddonApi.list()
    let records = installedRecords
    try {
      records = reconcileOfficialAddonRecords(installedRecords, await externalAddonApi.officialList())
    } catch (error) {
      this.logger?.warn?.('official addon provenance reconciliation failed', {
        error: error?.message || String(error)
      })
    }
    const communityEnabled = await externalAddonApi.getCommunityEnabled()""",
)

# Materialize native service binaries into the pinned addon checkout during development.
replace(
    "build/scripts/build-physical-addon.mjs",
    """cpSync(binaryPath, stagedSidecar)

const outputName =""",
    """cpSync(binaryPath, stagedSidecar)

if (process.env.ELEPHANT_ADDON_MATERIALIZE_SOURCE === '1') {
  const sourceSidecar = resolve(addonDir, safeModulePath(sidecarRelativePath, 'native executable path'))
  mkdirSync(dirname(sourceSidecar), { recursive: true })
  cpSync(binaryPath, sourceSidecar)
  console.log(`[physical-addon] materialized=${sourceSidecar}`)
}

if (process.env.ELEPHANT_ADDON_MATERIALIZE_ONLY === '1') {
  console.log(`[physical-addon] runner=${runner} modules=${copiedModules.size}`)
  process.exit(0)
}

const outputName =""",
)
replace(
    "build/scripts/sync-elephant-addons.mjs",
    """ensureLink('addons', cacheRoot)
ensureLink('packs', path.join(cacheRoot, 'packs'))
console.log(`[addons] materialized Elephant-Addons ${pinnedRef}`)""",
    """ensureLink('addons', cacheRoot)
ensureLink('packs', path.join(cacheRoot, 'packs'))

const platformKey = () => {
  const os = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch
  return `${os}-${arch}`
}

const materializeNativeServices = () => {
  if (process.env.ELEPHANT_SKIP_NATIVE_ADDON_BUILD === '1') {
    console.log('[addons] native service materialization skipped by ELEPHANT_SKIP_NATIVE_ADDON_BUILD')
    return
  }
  const platform = platformKey()
  const officialRoot = path.join(cacheRoot, 'official')
  for (const entry of fs.readdirSync(officialRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const addonDir = path.join(officialRoot, entry.name)
    const buildConfigPath = path.join(addonDir, 'addon.build.json')
    const manifestPath = path.join(addonDir, 'manifest.json')
    if (!fs.existsSync(buildConfigPath) || !fs.existsSync(manifestPath)) continue
    const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'))
    if (!Array.isArray(buildConfig.supportedPlatforms) || !buildConfig.supportedPlatforms.includes(platform)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const sidecar = manifest?.native?.sidecars?.[platform]
    if (!sidecar) continue
    const executable = path.join(addonDir, sidecar)
    if (fs.existsSync(executable) && fs.statSync(executable).isFile() && fs.statSync(executable).size > 0) continue
    console.log(`[addons] building missing native service ${manifest.id} for ${platform}`)
    execFileSync(process.execPath, [
      path.join(root, 'build/scripts/build-physical-addon.mjs'),
      `addons/official/${entry.name}`
    ], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELEPHANT_ADDON_PLATFORM: platform,
        ELEPHANT_ADDON_MATERIALIZE_SOURCE: '1',
        ELEPHANT_ADDON_MATERIALIZE_ONLY: '1'
      }
    })
    if (!fs.existsSync(executable) || !fs.statSync(executable).isFile() || fs.statSync(executable).size === 0) {
      throw new Error(`Native addon service was not materialized: ${manifest.id} (${sidecar})`)
    }
  }
}

materializeNativeServices()
console.log(`[addons] materialized Elephant-Addons ${pinnedRef}`)""",
)

# Remove the artificial vault-size cap while preserving depth, permissions and file-size guards.
replace(
    "Elephant/backend/tauri/src/addon_note_access.rs",
    "const MAX_LISTED_NOTES: usize = 1_000;\n",
    "",
)
replace(
    "Elephant/backend/tauri/src/addon_note_access.rs",
    """      if notes.len() >= MAX_LISTED_NOTES {
        return Err(format!("Addon note listing exceeded the maximum of {MAX_LISTED_NOTES} notes"));
      }
""",
    "",
)

# Remove the compiler warnings shown by pnpm tauri:dev.
replace(
    "Elephant/crates/muya-core/src/edit/mark_fragment_toggle.rs",
    "use crate::selection::{Selection, SelectionPoint};",
    "use crate::selection::Selection;",
)
replace(
    "Elephant/crates/muya-core/src/edit/mark_linked_same.rs",
    "use crate::model::{Document, InlineKind, InlineMarkKind, NodeId, NodeKind};",
    "use crate::model::{Document, InlineKind, InlineMarkKind, NodeKind};",
)
replace(
    "Elephant/crates/muya-core/src/edit/paragraph.rs",
    "use crate::model::{BlockKind, Document, InlineKind, NodeId, NodeKind};",
    "use crate::model::{BlockKind, Document, InlineKind, NodeKind};",
)
replace(
    "Elephant/crates/muya-core/src/edit/mod.rs",
    "pub(crate) use mark_fragments::build_partial_cross_wrapper_toggle;\n",
    "",
)
replace(
    "Elephant/crates/muya-core/src/edit/paste.rs",
    """      let suffix_id = NodeId(next_id);
      next_id = next_id.saturating_add(1);
""",
    """      let suffix_id = NodeId(next_id);
""",
)
replace(
    "Elephant/crates/muya-core/src/edit/paragraph_boundary.rs",
    "  top_wrapper: NodeId,\n",
    "",
)
replace(
    "Elephant/crates/muya-core/src/edit/paragraph_boundary.rs",
    """  Ok(BoundaryPath {
    paragraph,
    top_wrapper,
    top_index,
    destination,
  })""",
    """  Ok(BoundaryPath {
    paragraph,
    top_index,
    destination,
  })""",
)
replace(
    "Elephant/crates/muya-core/src/features/table.rs",
    "  cell: NodeId,\n",
    "",
)
replace(
    "Elephant/crates/muya-core/src/features/table.rs",
    """  Ok(TableContext {
    table,
    row,
    cell,
    row_index,""",
    """  Ok(TableContext {
    table,
    row,
    row_index,""",
)
replace(
    "Elephant/backend/tauri/src/addon_services.rs",
    "fn embedded_mobile_descriptor(manifest: &Value, os: &str) -> R<(String, String)> {",
    "#[cfg(mobile)]\nfn embedded_mobile_descriptor(manifest: &Value, os: &str) -> R<(String, String)> {",
)

Path("tests/app/unit/addons/addonRuntimeRegressions.spec.js").write_text(
    """import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { reconcileOfficialAddonRecords } from '../../../../Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

describe('addon runtime regression repairs', () => {
  it('restores official provenance for historical registry records', () => {
    const [record] = reconcileOfficialAddonRecords(
      [{ source: 'external', manifest: { id: 'elephant.wiki' } }],
      [{ id: 'elephant.wiki', official: true }]
    )
    expect(record.source).toBe('official')
    expect(record.official).toBe(true)
    expect(record.manifest.official).toBe(true)
  })

  it('persists official provenance after catalogue installation', () => {
    const source = read('Elephant/backend/tauri/src/official_addon_catalog.rs')
    expect(source).toContain('persist_official_source(&app, &record.manifest.id)?')
    expect(source).toContain('record.insert("source".to_string(), Value::String("official".to_string()))')
  })

  it('materializes missing native services during addon synchronization', () => {
    const sync = read('build/scripts/sync-elephant-addons.mjs')
    const builder = read('build/scripts/build-physical-addon.mjs')
    expect(sync).toContain('materializeNativeServices()')
    expect(sync).toContain('ELEPHANT_ADDON_MATERIALIZE_SOURCE')
    expect(builder).toContain('ELEPHANT_ADDON_MATERIALIZE_ONLY')
    expect(builder).toContain('materialized=${sourceSidecar}')
  })

  it('does not truncate large vaults at one thousand notes', () => {
    const source = read('Elephant/backend/tauri/src/addon_note_access.rs')
    expect(source).not.toContain('MAX_LISTED_NOTES')
    expect(source).not.toContain('Addon note listing exceeded the maximum')
    expect(source).toContain('MAX_DIRECTORY_DEPTH')
    expect(source).toContain('MAX_NOTE_BYTES')
  })
})
"""
)
