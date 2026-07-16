#!/usr/bin/env bash
set -euxo pipefail

ADDONS_COMMIT="8458c1cc9ed074148697e6edc5ffc0f05bbf05ab"

python <<'PY'
import json
from pathlib import Path

root = Path('.')
addons_commit = '8458c1cc9ed074148697e6edc5ffc0f05bbf05ab'

sync_script = root / 'build/scripts/sync-elephant-addons.mjs'
sync_script.write_text(f'''import fs from 'node:fs'\nimport path from 'node:path'\nimport {{ execFileSync }} from 'node:child_process'\nimport {{ fileURLToPath }} from 'node:url'\n\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')\nconst repository = 'https://github.com/SorbetUP/Elephant-Addons.git'\nconst pinnedRef = process.env.ELEPHANT_ADDONS_REF || '{addons_commit}'\nconst cacheRoot = path.join(root, '.cache', 'elephant-addons')\n\nconst runGit = (args, cwd = root) => execFileSync('git', args, {{ cwd, stdio: 'inherit' }})\nconst currentHead = () => {{\n  try {{\n    return execFileSync('git', ['rev-parse', 'HEAD'], {{ cwd: cacheRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }}).trim()\n  }} catch {{\n    return ''\n  }}\n}}\n\nif (currentHead() !== pinnedRef) {{\n  fs.rmSync(cacheRoot, {{ recursive: true, force: true }})\n  fs.mkdirSync(path.dirname(cacheRoot), {{ recursive: true }})\n  runGit(['clone', '--filter=blob:none', '--no-checkout', repository, cacheRoot])\n  runGit(['fetch', '--depth', '1', 'origin', pinnedRef], cacheRoot)\n  runGit(['checkout', '--detach', 'FETCH_HEAD'], cacheRoot)\n  if (currentHead() !== pinnedRef) throw new Error(`Elephant-Addons checkout mismatch: expected ${{pinnedRef}}`)\n}}\n\nfor (const required of ['catalog.json', 'official', 'packs/base.enaddonpack', 'packs/develop-parity.enaddonpack']) {{\n  if (!fs.existsSync(path.join(cacheRoot, required))) throw new Error(`Elephant-Addons is missing ${{required}}`)\n}}\n\nconst ensureLink = (linkName, target) => {{\n  const linkPath = path.join(root, linkName)\n  fs.rmSync(linkPath, {{ recursive: true, force: true }})\n  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')\n}}\n\nensureLink('addons', cacheRoot)\nensureLink('packs', path.join(cacheRoot, 'packs'))\nconsole.log(`[addons] materialized Elephant-Addons ${{pinnedRef}}`)\n''')

ignore_path = Path('.gitignore')
ignore = ignore_path.read_text()
block = '''\n# Materialized from SorbetUP/Elephant-Addons; never commit these paths here.\n/.cache/elephant-addons/\n/addons\n/packs\n'''
if '/.cache/elephant-addons/' not in ignore:
    ignore_path.write_text(ignore.rstrip() + '\n' + block)

package_path = Path('package.json')
package = json.loads(package_path.read_text())
scripts = package['scripts']
scripts['addons:sync'] = 'node build/scripts/sync-elephant-addons.mjs'
scripts['postinstall'] = 'pnpm addons:sync && node build/scripts/postinstall.js'
for name in [
    'addon:build', 'addon:build:ocr', 'addon:build:open-models', 'addon:build:codex',
    'tauri:web:dev', 'tauri:web:build', 'test', 'test:unit', 'coverage', 'coverage:unit'
]:
    value = scripts[name]
    if not value.startswith('pnpm addons:sync && '):
        scripts[name] = 'pnpm addons:sync && ' + value
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

setup_path = Path('.github/actions/setup/action.yml')
setup = setup_path.read_text()
marker = '''      env:\n        GITHUB_TOKEN: ${{ github.token }}\n'''
addition = marker + '''\n    - name: Materialize official addons\n      shell: bash\n      run: node build/scripts/sync-elephant-addons.mjs\n'''
if 'name: Materialize official addons' not in setup:
    if marker not in setup:
        raise SystemExit('Unable to locate setup action insertion point')
    setup_path.write_text(setup.replace(marker, addition, 1))

cargo_path = Path('Elephant/backend/tauri/Cargo.toml')
cargo = cargo_path.read_text()
old_dep = 'elephantnote-knowledge-core = { path = "../../../addons/official/knowledge/native/knowledge-core" }'
new_dep = f'elephantnote-knowledge-core = {{ git = "https://github.com/SorbetUP/Elephant-Addons", rev = "{addons_commit}", package = "elephantnote-knowledge-core" }}'
if old_dep in cargo:
    cargo_path.write_text(cargo.replace(old_dep, new_dep, 1))
elif new_dep not in cargo:
    raise SystemExit('Unable to locate mobile Knowledge dependency')

catalog_path = Path('Elephant/backend/tauri/src/official_addon_catalog.rs')
catalog = catalog_path.read_text()
old_constants = '''const INTEGRATED_CATALOG: &str = include_str!("../../../../addons/catalog.json");
// The repair branch is intentionally used while PR #84 validates installation on
// Android and desktop. Change this to develop_next when the branch is merged.
const OFFICIAL_ROOT: &str = "https://raw.githubusercontent.com/SorbetUP/ElephantNote/develop_next-integration-repair/addons/";
'''
new_constants = '''const OFFICIAL_ROOT: &str = "https://raw.githubusercontent.com/SorbetUP/Elephant-Addons/main/";
const OFFICIAL_CATALOG_PATH: &str = "catalog.json";
const MAX_CATALOG_BYTES: u64 = 1024 * 1024;
'''
if old_constants in catalog:
    catalog = catalog.replace(old_constants, new_constants, 1)
elif new_constants not in catalog:
    raise SystemExit('Unable to locate official catalogue constants')

old_catalog_fn = '''fn catalog() -> R<Vec<CatalogAddon>> {
  let parsed: IntegratedCatalog = serde_json::from_str(INTEGRATED_CATALOG)
    .map_err(|error| format!("Invalid integrated official addon catalogue: {error}"))?;
  for item in &parsed.addons {
    if !item.official || !item.id.starts_with("elephant.") {
      return Err(format!("Integrated catalogue contains a non-official addon: {}", item.id));
    }
    safe_official_path(&item.manifest_path)?;
    safe_official_path(&item.entry_path)?;
  }
  Ok(parsed.addons)
}
'''
new_catalog_fn = '''fn parse_catalog(bytes: &[u8]) -> R<Vec<CatalogAddon>> {
  let parsed: IntegratedCatalog = serde_json::from_slice(bytes)
    .map_err(|error| format!("Invalid official addon catalogue: {error}"))?;
  for item in &parsed.addons {
    if !item.official || !item.id.starts_with("elephant.") {
      return Err(format!("Official catalogue contains a non-official addon: {}", item.id));
    }
    safe_official_path(&item.manifest_path)?;
    safe_official_path(&item.entry_path)?;
  }
  Ok(parsed.addons)
}

fn fetch_catalog_bytes() -> R<Vec<u8>> {
  let root = Url::parse(OFFICIAL_ROOT).map_err(|error| error.to_string())?;
  let url = root.join(OFFICIAL_CATALOG_PATH).map_err(|error| error.to_string())?;
  if url.scheme() != "https"
    || url.host_str() != Some("raw.githubusercontent.com")
    || url.path() != "/SorbetUP/Elephant-Addons/main/catalog.json"
  {
    return Err("Official addon catalogue URL escaped the dedicated repository.".to_string());
  }
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(90))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|error| error.to_string())?;
  let mut response = client
    .get(url)
    .send()
    .map_err(|error| format!("Failed to reach the official addon catalogue: {error}"))?;
  if !response.status().is_success() {
    return Err(format!("Official addon catalogue returned HTTP {}", response.status()));
  }
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take(MAX_CATALOG_BYTES + 1)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  if bytes.len() as u64 > MAX_CATALOG_BYTES {
    return Err("Official addon catalogue exceeds the allowed size.".to_string());
  }
  Ok(bytes)
}

fn catalog() -> R<Vec<CatalogAddon>> {
  let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../addons/catalog.json");
  let bytes = if local.is_file() {
    fs::read(local).map_err(|error| error.to_string())?
  } else {
    fetch_catalog_bytes()?
  };
  parse_catalog(&bytes)
}
'''
if old_catalog_fn in catalog:
    catalog = catalog.replace(old_catalog_fn, new_catalog_fn, 1)
elif new_catalog_fn not in catalog:
    raise SystemExit('Unable to locate embedded official catalogue parser')

catalog = catalog.replace(
    '|| !url.path().starts_with("/SorbetUP/ElephantNote/develop_next-integration-repair/addons/official/")',
    '|| !url.path().starts_with("/SorbetUP/Elephant-Addons/main/official/")'
)
catalog = catalog.replace(
    'return Err("Official addon URL escaped the trusted repository branch.".to_string());',
    'return Err("Official addon URL escaped the dedicated addon repository.".to_string());'
)
catalog_path.write_text(catalog)

ownership = Path('docs/repository/addon-source-ownership.md')
ownership.write_text(f'''# Addon source ownership

The Elephant application repository no longer tracks physical addon implementations or protected addon packs.

Canonical source: `https://github.com/SorbetUP/Elephant-Addons`

Pinned integration revision: `{addons_commit}`

`build/scripts/sync-elephant-addons.mjs` materializes the pinned repository into the ignored `.cache/elephant-addons` directory and exposes ignored `addons` / `packs` compatibility links for existing build and validation tooling. Runtime package downloads and the official catalogue use the dedicated repository directly.

Elephant retains only the generic addon host, installer, permission broker, scoped APIs, service/sidecar host and UI extension points.
''')
PY

if git ls-files --error-unmatch addons/catalog.json >/dev/null 2>&1; then
  git rm -r addons packs
fi
node build/scripts/sync-elephant-addons.mjs

corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile --ignore-scripts
cargo generate-lockfile --manifest-path Elephant/backend/tauri/Cargo.toml

node build/scripts/sync-elephant-addons.mjs
node build/scripts/validate-addon-catalog.mjs 2>&1 | tee addon-catalog-validation.txt
NODE_PATH=Elephant/node_modules Elephant/node_modules/.bin/vitest run \
  tests/app/unit/addons/addonsCatalogueUi.spec.js \
  tests/app/unit/addons/officialAddonCatalogBridge.spec.js \
  tests/app/unit/addons/packageResourceContracts.spec.js \
  tests/app/unit/addons/knowledgePhysicalAddon.spec.js \
  tests/app/unit/addons/wikiPackageOwnership.spec.js \
  tests/app/unit/addons/searchPackageOwnership.spec.js \
  2>&1 | tee addon-extraction-tests.txt
cargo test --manifest-path Elephant/backend/tauri/Cargo.toml official_addon_catalog::tests \
  2>&1 | tee addon-catalog-rust-tests.txt

test -L addons
test -L packs
git check-ignore -q addons
git check-ignore -q packs
test -z "$(git ls-files addons packs)"
! grep -R --line-number \
  'raw.githubusercontent.com/SorbetUP/ElephantNote/.*/addons' \
  Elephant build tests .github package.json \
  --exclude-dir=node_modules \
  --exclude-dir=target
git diff --check

rm -f .github/workflows/extract-addon-sources.yml
rm -f .github/workflows/trigger-extract-addon-sources.yml
rm -f build/scripts/extract-addon-sources.sh

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git add -A
git commit -m 'refactor(addons): move physical sources and packs to Elephant-Addons'
git push origin HEAD:develop_next-integration-repair
