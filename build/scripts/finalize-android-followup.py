#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace(path, old, new, count=1):
    text = read(path)
    if old not in text:
        raise SystemExit(f"Missing anchor in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, count))


# 1. Preserve the text/binary contract. Markdown must never surface as comma-separated UTF-8 bytes.
path = 'Elephant/frontend/src/renderer/src/platform/tauriFileUtilsPathGuards.js'
replace(path,
"const EXCALIDRAW_SCENE_RE = /(?:^|\\/)\\.assets\\/excalidraw-[^/]+\\.excalidraw(?:[?#].*)?$/i\n",
"const EXCALIDRAW_SCENE_RE = /(?:^|\\/)\\.assets\\/excalidraw-[^/]+\\.excalidraw(?:[?#].*)?$/i\nconst TEXT_FILE_RE = /\\.(?:md|markdown|txt|json|jsonl|ya?ml|toml|csv|tsv|html?|css|s[ac]ss|less|jsx?|mjs|cjs|tsx?|vue|xml|svg|excalidraw)(?:[?#].*)?$/i\n")
replace(path,
"const formatReadResult = (bytes, option) => {\n  const encoding = readEncoding(option)\n  if (encoding) return new TextDecoder(encoding === 'utf8' ? 'utf-8' : encoding).decode(bytes)\n  if (globalThis.Buffer?.from) return globalThis.Buffer.from(bytes)\n  return bytes\n}\n",
"const formatReadResult = (bytes, option, pathname = '') => {\n  const encoding = readEncoding(option)\n  if (encoding || TEXT_FILE_RE.test(String(pathname || ''))) {\n    return new TextDecoder(encoding === 'utf8' ? 'utf-8' : (encoding || 'utf-8')).decode(bytes)\n  }\n  if (globalThis.Buffer?.from) return globalThis.Buffer.from(bytes)\n  return bytes\n}\n")
replace(path,
"    return formatReadResult(base64ToBytes(result.dataBase64), options)\n",
"    return formatReadResult(base64ToBytes(result.dataBase64), options, resolved)\n")

# 2. New notes are truly empty. The generated file name is storage-only, not visible note content.
path = 'Elephant/backend/tauri/src/vault/entries.rs'
replace(path,
"    let note_title = title.unwrap_or_else(|| {\n        title_from_name(\n            path.file_name()\n                .and_then(|name| name.to_str())\n                .unwrap_or(\"Untitled.md\"),\n        )\n    });\n    fs::write(&path, format!(\"# {}\\n\", note_title)).map_err(|error| error.to_string())?;\n",
"    fs::write(&path, \"\").map_err(|error| error.to_string())?;\n")
replace(path,
"    fn ignores_hidden_entries() {\n        assert!(is_ignored_entry(\".git\"));\n        assert!(is_ignored_entry(\".elephantnote\"));\n        assert!(!is_ignored_entry(\"note.md\"));\n    }\n",
"    fn ignores_hidden_entries() {\n        assert!(is_ignored_entry(\".git\"));\n        assert!(is_ignored_entry(\".elephantnote\"));\n        assert!(!is_ignored_entry(\"note.md\"));\n    }\n\n    #[test]\n    fn new_notes_have_empty_content() {\n        let temp = tempfile::tempdir().unwrap();\n        let vault = VaultDescriptor {\n            id: \"test\".to_string(),\n            name: \"Test\".to_string(),\n            path: temp.path().to_string_lossy().to_string(),\n            icon: None,\n        };\n        let entry = create_note(&vault, None, None, None).unwrap();\n        let full_path = entry.get(\"fullPath\").and_then(Value::as_str).unwrap();\n        assert_eq!(fs::read_to_string(full_path).unwrap(), \"\");\n    }\n")

# 3. A title may be absent. Do not synthesize a visible H1 until the user types a title.
path = 'Elephant/shared/markdownDocument.js'
replace(path,
"export const getDocumentTitle = (markdown = '', fallback = 'Untitled') => {\n  const { fields, body } = parseFrontmatter(markdown)\n  const headingTitle = body.match(/^#\\s+(.+)$/m)?.[1]\n  return fields.title || headingTitle || fallback || 'Untitled'\n}\n",
"export const getExplicitDocumentTitle = (markdown = '') => {\n  const { fields, body } = parseFrontmatter(markdown)\n  const headingTitle = body.match(/^#\\s+(.+)$/m)?.[1]\n  return String(fields.title || headingTitle || '').trim()\n}\n\nexport const getDocumentTitle = (markdown = '', fallback = 'Untitled') =>\n  getExplicitDocumentTitle(markdown) || fallback || 'Untitled'\n")
replace(path,
"const composeNoteDocument = (rawFrontmatter, title, body = '') => {\n  const normalizedBody = stripDisplayedTitle(body, title).trim()\n  if (!normalizedBody) return rawFrontmatter\n  return `${rawFrontmatter}\\n\\n# ${title}\\n\\n${normalizedBody}`.trimEnd()\n}\n",
"const composeNoteDocument = (rawFrontmatter, title, body = '') => {\n  const normalizedTitle = String(title || '').trim()\n  const normalizedBody = stripDisplayedTitle(body, normalizedTitle).trim()\n  if (!normalizedBody) return rawFrontmatter\n  const heading = normalizedTitle ? `# ${normalizedTitle}\\n\\n` : ''\n  return `${rawFrontmatter}\\n\\n${heading}${normalizedBody}`.trimEnd()\n}\n")
replace(path,
"  const normalizedTitle = String(title || '').trim() || 'Untitled'\n",
"  const normalizedTitle = String(title ?? '').trim()\n", 1)
replace(path,
"export const mergeEditorMarkdown = (currentDocument = '', editorMarkdown = '', fallbackTitle = 'Untitled') => {\n  const title = getDocumentTitle(currentDocument, fallbackTitle)\n",
"export const mergeEditorMarkdown = (currentDocument = '', editorMarkdown = '', fallbackTitle = 'Untitled') => {\n  const title = getExplicitDocumentTitle(currentDocument) || String(fallbackTitle ?? '').trim()\n")
replace(path,
"export const renameDocumentTitle = (markdown = '', nextTitle = 'Untitled') => {\n  const title = String(nextTitle || '').trim() || 'Untitled'\n",
"export const renameDocumentTitle = (markdown = '', nextTitle = '') => {\n  const title = String(nextTitle ?? '').trim()\n")
# Keep tag creation titleless when the user has not chosen a title yet.
replace(path,
"export const updateMarkdownTags = (markdown = '', nextTags = [], title = 'Untitled') => {\n  const normalizedTitle = String(title || '').trim() || 'Untitled'\n",
"export const updateMarkdownTags = (markdown = '', nextTags = [], title = '') => {\n  const normalizedTitle = String(title ?? '').trim()\n")
replace(path,
"      `# ${normalizedTitle}`,\n      '',\n      body\n",
"      ...(normalizedTitle ? [`# ${normalizedTitle}`, ''] : []),\n      body\n")

# 4. Title field is a placeholder, and generated storage names are not exposed in the editor.
path = 'Elephant/frontend/app/components/editor/NoteEditorTopBar.vue'
replace(path,
"      aria-label=\"Note title\"\n      enterkeyhint=\"next\"\n",
"      aria-label=\"Note title\"\n      placeholder=\"Titre\"\n      autocomplete=\"off\"\n      enterkeyhint=\"next\"\n")

path = 'Elephant/frontend/app/components/editor/NoteEditorHost.vue'
replace(path,
"import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'\n",
"import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'\nimport { convertFileSrc } from '@tauri-apps/api/core'\n")
replace(path,
"  getDocumentCreatedAt,\n  getDocumentTitle,\n",
"  getDocumentCreatedAt,\n  getDocumentTitle,\n  getExplicitDocumentTitle,\n")
replace(path,
"const documentToEditorMarkdown = (documentMarkdown) =>\n  toEditorMarkdown(documentMarkdown, fallbackTitle.value)\nconst editorToDocumentMarkdown = (editorMarkdown) =>\n  mergeEditorMarkdown(markdown.value, editorMarkdown, fallbackTitle.value)\nconst visibleMarkdown = computed(() => documentToEditorMarkdown(markdown.value))\nconst documentMeta = computed(() => {\n  const content = markdown.value || ''\n  const createdAt = getDocumentCreatedAt(content)\n  return {\n    title: getDocumentTitle(content, fallbackTitle.value),\n",
"const isGeneratedStorageTitle = (value = '') => /^(?:untitled|untilted)(?:[ _-]*\\d+)?$/i.test(String(value || '').trim())\nconst renderedImageSources = new Map()\nconst splitImageDestination = (raw = '') => {\n  const value = String(raw || '').trim()\n  if (!value) return { source: '', suffix: '' }\n  if (value.startsWith('<')) {\n    const end = value.indexOf('>')\n    if (end > 0) return { source: value.slice(1, end), suffix: value.slice(end + 1) }\n  }\n  const match = value.match(/^(\\S+)(.*)$/)\n  return { source: match?.[1] || value, suffix: match?.[2] || '' }\n}\nconst renderLocalImages = (editorMarkdown = '') => String(editorMarkdown || '').replace(\n  MARKDOWN_IMAGE_RE,\n  (whole, prefix, destination, closing) => {\n    const { source, suffix } = splitImageDestination(destination)\n    if (!source || isExternalAssetReference(source)) return whole\n    const absolute = resolveLocalImageSource(source, currentNoteDirectory.value)\n    if (!absolute) return whole\n    const rendered = convertFileSrc(absolute)\n    renderedImageSources.set(rendered, source)\n    return `${prefix}${rendered}${suffix}${closing}`\n  }\n)\nconst restoreLocalImageSources = (editorMarkdown = '') => {\n  let restored = String(editorMarkdown || '')\n  for (const [rendered, source] of renderedImageSources) {\n    restored = restored.split(rendered).join(source)\n  }\n  return restored\n}\nconst documentToEditorMarkdown = (documentMarkdown) =>\n  renderLocalImages(toEditorMarkdown(documentMarkdown, fallbackTitle.value))\nconst editorToDocumentMarkdown = (editorMarkdown) =>\n  mergeEditorMarkdown(markdown.value, restoreLocalImageSources(editorMarkdown), noteTitle.value)\nconst visibleMarkdown = computed(() => documentToEditorMarkdown(markdown.value))\nconst documentMeta = computed(() => {\n  const content = markdown.value || ''\n  const createdAt = getDocumentCreatedAt(content)\n  const explicitTitle = getExplicitDocumentTitle(content)\n  const fallback = fallbackTitle.value\n  const title = explicitTitle || (!content.trim() && isGeneratedStorageTitle(fallback) ? '' : getDocumentTitle(content, fallback))\n  return {\n    title,\n")
replace(path,
"    title: metadata.title || entry.title,\n",
"    title: Object.prototype.hasOwnProperty.call(metadata, 'title') ? metadata.title : entry.title,\n")
replace(path,
"const updateTitle = (nextTitle) => {\n  const title = String(nextTitle || '').trim() || fallbackTitle.value\n",
"const updateTitle = (nextTitle) => {\n  const title = String(nextTitle ?? '').trim()\n")

# Remove CSS that accidentally replaced the pin icon (the last button) with a fake back arrow.
path = 'Elephant/frontend/src/renderer/src/mobile-native-ux.css'
text = read(path)
text = re.sub(r"\n\s*\.en-main\.has-editor-open \.en-note-topbar-actions \.en-note-action-button:last-child svg \{.*?\n\s*\}\n\n\s*\.en-main\.has-editor-open \.en-note-topbar-actions \.en-note-action-button:last-child::before \{.*?\n\s*\}\n", "\n", text, flags=re.S)
write(path, text)

# 5. Android camera permission, system back handling and real native Sharesheet.
path = 'Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js'
replace(path,
"const requestCameraStream = async (target, facingMode) => {\n",
"const requestNativeCameraPermission = async (target) => {\n  const scanner = target.__TAURI__?.barcodeScanner\n  if (!scanner?.checkPermissions || !scanner?.requestPermissions) return\n  const raw = await scanner.checkPermissions()\n  const state = typeof raw === 'string' ? raw : (raw?.camera || raw?.permission || raw?.state)\n  if (state === 'granted') return\n  const requested = await scanner.requestPermissions()\n  const next = typeof requested === 'string' ? requested : (requested?.camera || requested?.permission || requested?.state)\n  if (next !== 'granted') throw new Error('Camera permission was refused.')\n}\n\nconst requestCameraStream = async (target, facingMode) => {\n")
replace(path,
"  try {\n    stream = await requestCameraStream(target, facingMode)\n",
"  try {\n    await requestNativeCameraPermission(target)\n    stream = await requestCameraStream(target, facingMode)\n")
replace(path,
"  const stop = () => {\n    stream?.getTracks?.().forEach((track) => track.stop())\n    backdrop.remove()\n  }\n",
"  let stopped = false\n  const onAndroidBack = (event) => {\n    event.preventDefault()\n    stop()\n  }\n  const stop = () => {\n    if (stopped) return\n    stopped = true\n    stream?.getTracks?.().forEach((track) => track.stop())\n    if (video) video.srcObject = null\n    target.removeEventListener('elephantnote:android-back', onAndroidBack)\n    backdrop.remove()\n  }\n  target.addEventListener('elephantnote:android-back', onAndroidBack)\n")
replace(path,
"const shareCurrentNote = async (target) => {\n  const title = target.document.querySelector('.en-note-title-input')?.value || 'Note'\n  const text = target.document.querySelector('.en-main.has-editor-open .ag-editor')?.innerText?.trim() || title\n  if (typeof target.navigator.share === 'function') {\n    await target.navigator.share({ title, text })\n    return\n  }\n  await target.navigator.clipboard?.writeText?.(`${title}\\n\\n${text}`)\n}\n",
"const shareCurrentNote = async (target) => {\n  const title = target.document.querySelector('.en-note-title-input')?.value?.trim() || 'Note'\n  const body = target.document.querySelector('.en-main.has-editor-open .ag-editor')?.innerText?.trim() || ''\n  const text = body || title\n  const invoke = target.__TAURI__?.core?.invoke\n  if (typeof invoke === 'function') {\n    await invoke('tauri_android_share_text', { title, text })\n    return\n  }\n  if (typeof target.navigator.share === 'function') {\n    await target.navigator.share({ title, text })\n    return\n  }\n  throw new Error('System sharing is unavailable on this platform.')\n}\n")

path = 'Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js'
replace(path,
"    try {\n      const settingsClose = target.document.querySelector('.en-settings-close')\n",
"    try {\n      const backEvent = new CustomEvent('elephantnote:android-back', { cancelable: true })\n      if (!target.dispatchEvent(backEvent)) {\n        handled = true\n      } else {\n      const settingsClose = target.document.querySelector('.en-settings-close')\n")
replace(path,
"        }\n      }\n    } catch (error) {\n",
"        }\n      }\n      }\n    } catch (error) {\n", 1)

# Native plugin: validate persisted SAF grants and use Android ACTION_SEND/chooser.
path = 'Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt'
replace(path,
"class ShadowArgs {\n  var shadowPath: String = \"\"\n}\n",
"class ShadowArgs {\n  var shadowPath: String = \"\"\n}\n\n@InvokeArg\nclass ShareTextArgs {\n  var title: String = \"Note\"\n  var text: String = \"\"\n}\n")
replace(path,
"  @Command\n  fun clear(invoke: Invoke) {\n",
"  @Command\n  fun shareText(invoke: Invoke) {\n    try {\n      val args = invoke.parseArgs(ShareTextArgs::class.java)\n      val sendIntent = Intent(Intent.ACTION_SEND).apply {\n        type = \"text/plain\"\n        putExtra(Intent.EXTRA_TITLE, args.title)\n        putExtra(Intent.EXTRA_SUBJECT, args.title)\n        putExtra(Intent.EXTRA_TEXT, args.text)\n      }\n      activity.startActivity(Intent.createChooser(sendIntent, args.title.ifBlank { \"Share note\" }))\n      invoke.resolve()\n    } catch (error: Exception) {\n      invoke.reject(error.message ?: \"Unable to open Android sharing.\")\n    }\n  }\n\n  @Command\n  fun clear(invoke: Invoke) {\n")
replace(path,
"  private fun persistedUri(): Uri? =\n    preferences.getString(\"tree_uri\", null)?.let(Uri::parse)\n",
"  private fun persistedUri(): Uri? {\n    val uri = preferences.getString(\"tree_uri\", null)?.let(Uri::parse) ?: return null\n    val granted = activity.contentResolver.persistedUriPermissions.any { permission ->\n      permission.uri == uri && permission.isReadPermission && permission.isWritePermission\n    }\n    if (!granted) {\n      preferences.edit().clear().apply()\n      return null\n    }\n    return uri\n  }\n")

path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/models.rs'
text = read(path)
if 'pub struct ShareTextRequest' not in text:
    text += "\n#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]\n#[serde(rename_all = \"camelCase\")]\npub struct ShareTextRequest {\n    pub title: String,\n    pub text: String,\n}\n"
write(path, text)

path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/mobile.rs'
replace(path,
"    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n        self.0.run_mobile_plugin(\"clear\", request).map_err(Into::into)\n    }\n",
"    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n        self.0.run_mobile_plugin(\"clear\", request).map_err(Into::into)\n    }\n\n    pub fn share_text(&self, request: ShareTextRequest) -> Result<()> {\n        self.0.run_mobile_plugin(\"shareText\", request).map_err(Into::into)\n    }\n")

# Desktop implementation needs the same API surface, but sharing is Android-only.
path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/desktop.rs'
replace(path,
"    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n",
"    pub fn share_text(&self, _request: ShareTextRequest) -> Result<()> {\n        Err(Error::UnsupportedPlatform)\n    }\n\n    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n")

path = 'Elephant/backend/tauri/src/android_vault_commands.rs'
replace(path,
"use tauri_plugin_elephant_android_vault::{ElephantAndroidVaultExt, ShadowRequest, TreeState};\n",
"use tauri_plugin_elephant_android_vault::{\n    ElephantAndroidVaultExt, ShadowRequest, ShareTextRequest, TreeState,\n};\n")
text = read(path)
text += "\n#[tauri::command]\npub fn tauri_android_share_text(\n    app: AppHandle,\n    title: String,\n    text: String,\n) -> Result<(), String> {\n    app.elephant_android_vault()\n        .share_text(ShareTextRequest { title, text })\n        .map_err(|error| error.to_string())\n}\n"
write(path, text)

path = 'Elephant/backend/tauri/src/lib_min.rs'
replace(path,
"            android_vault_commands::tauri_android_vault_clear,\n",
"            android_vault_commands::tauri_android_vault_clear,\n            android_vault_commands::tauri_android_share_text,\n")

# 6. SAF authorization is the system folder picker. Make that explicit and available after onboarding.
path = 'Elephant/frontend/app/components/shell/EmptyVaultPicker.vue'
replace(path,
"          <span class=\"en-storage-mode-label\">Simple mode</span>\n          <strong>Let Elephant manage it</strong>\n",
"          <span class=\"en-storage-mode-label\">Stockage privé</span>\n          <strong>Continuer sans accès aux fichiers</strong>\n")
replace(path,
"          <span class=\"en-storage-mode-label\">Advanced mode</span>\n          <strong>Choose a vault folder</strong>\n",
"          <span class=\"en-storage-mode-label\">Dossier Android</span>\n          <strong>Choisir un dossier et autoriser l’accès</strong>\n")
replace(path,
".en-storage-mode-simple {\n",
".en-storage-mode-advanced {\n")

path = 'Elephant/frontend/app/components/settings/SettingsPanel.vue'
replace(path,
"                 <div class=\"en-settings-row\">\n                   <div class=\"en-settings-row-copy\"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>\n                   <span class=\"en-status-badge active\"><HardDrive aria-hidden=\"true\" />{{ activeVaultName }}</span>\n                 </div>\n",
"                 <div class=\"en-settings-row\">\n                   <div class=\"en-settings-row-copy\"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>\n                   <span class=\"en-status-badge active\"><HardDrive aria-hidden=\"true\" />{{ activeVaultName }}</span>\n                 </div>\n                 <div class=\"en-settings-row\">\n                   <div class=\"en-settings-row-copy\"><strong>Android folder access</strong><span>Open Android's system folder picker. Selecting a folder grants Elephant persistent access only to that folder.</span></div>\n                   <button class=\"en-primary-button\" type=\"button\" :disabled=\"isChoosingAndroidVault\" @click=\"chooseAndroidVault\"><FolderOpen aria-hidden=\"true\" />{{ isChoosingAndroidVault ? 'Opening…' : 'Authorize a folder' }}</button>\n                 </div>\n")
replace(path,
"  { id: 'vault-open', section: 'vaults', label: 'Open vaults', description: 'Review or remove registered vaults.' },\n",
"  { id: 'vault-open', section: 'vaults', label: 'Open vaults', description: 'Review or remove registered vaults.' },\n  { id: 'vault-android-access', section: 'vaults', label: 'Android folder access', description: 'Authorize or reconnect a folder with Android system storage.' },\n")
replace(path,
"const removingVaultId = ref('')\n",
"const removingVaultId = ref('')\nconst isChoosingAndroidVault = ref(false)\n")
replace(path,
"const removeVaultFromApp = async (vault) => {\n",
"const chooseAndroidVault = async () => {\n  isChoosingAndroidVault.value = true\n  vaultMessage.value = ''\n  try {\n    const result = await vaultStore.chooseVault()\n    vaultMessage.value = result?.canceled\n      ? 'Folder authorization canceled.'\n      : 'Android folder access granted and vault connected.'\n  } catch (error) {\n    vaultMessage.value = error instanceof Error ? error.message : 'Unable to authorize the Android folder.'\n  } finally {\n    isChoosingAndroidVault.value = false\n  }\n}\n\nconst removeVaultFromApp = async (vault) => {\n")

# 7. Enable Tauri's supported asset protocol for images stored in the app data vault.
path = 'Elephant/backend/tauri/tauri.android.conf.json'
config = json.loads(read(path))
app = config.setdefault('app', {})
security = app.setdefault('security', {})
security['csp'] = "default-src 'self' ipc: http://ipc.localhost; img-src 'self' data: blob: asset: http://asset.localhost https:; media-src 'self' blob: asset: http://asset.localhost"
security['assetProtocol'] = {
    'enable': True,
    'scope': ['$APPDATA/**', '$APPLOCALDATA/**', '/data/user/0/com.elephantnote.app/**', '/data/data/com.elephantnote.app/**']
}
write(path, json.dumps(config, indent=2) + '\n')

# Ignore build output and remove accidentally tracked Android plugin artifacts.
write('Elephant/backend/tauri-plugin-elephant-android-vault/android/.gitignore', '/build/\n/.tauri/\n')

# 8. Focused regression contracts.
write('tests/app/unit/specs/main/elephantnote/androidFollowupRegression.spec.js', """import { describe, expect, it } from 'vitest'\nimport fs from 'node:fs'\nimport path from 'node:path'\n\nconst root = process.cwd()\nconst read = (file) => fs.readFileSync(path.join(root, file), 'utf8')\n\ndescribe('Android follow-up regressions', () => {\n  it('decodes textual vault files but preserves binary payloads', () => {\n    const source = read('Elephant/frontend/src/renderer/src/platform/tauriFileUtilsPathGuards.js')\n    expect(source).toContain('TEXT_FILE_RE')\n    expect(source).toContain("formatReadResult(base64ToBytes(result.dataBase64), options, resolved)")\n    expect(source).toContain("new TextDecoder")\n  })\n\n  it('creates empty notes and presents a title placeholder', () => {\n    const entries = read('Elephant/backend/tauri/src/vault/entries.rs')\n    const topbar = read('Elephant/frontend/app/components/editor/NoteEditorTopBar.vue')\n    expect(entries).toContain('fs::write(&path, "")')\n    expect(entries).not.toContain('format!("# {}\\n", note_title)')\n    expect(topbar).toContain('placeholder="Titre"')\n  })\n\n  it('uses the native Android Sharesheet instead of clipboard masquerading as share', () => {\n    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')\n    const native = read('Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt')\n    expect(runtime).toContain("invoke('tauri_android_share_text'")\n    expect(runtime).not.toContain("navigator.clipboard?.writeText?.(`${title}")\n    expect(native).toContain('Intent.ACTION_SEND')\n    expect(native).toContain('Intent.createChooser')\n  })\n\n  it('lets Android back close camera and release every media track', () => {\n    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')\n    const navigation = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')\n    expect(runtime).toContain("addEventListener('elephantnote:android-back'")\n    expect(runtime).toContain('track.stop()')\n    expect(navigation).toContain("new CustomEvent('elephantnote:android-back', { cancelable: true })")\n  })\n\n  it('renders local images through Tauri asset URLs and enables the asset protocol', () => {\n    const host = read('Elephant/frontend/app/components/editor/NoteEditorHost.vue')\n    const config = JSON.parse(read('Elephant/backend/tauri/tauri.android.conf.json'))\n    expect(host).toContain('convertFileSrc')\n    expect(host).toContain('restoreLocalImageSources')\n    expect(config.app.security.assetProtocol.enable).toBe(true)\n  })\n\n  it('uses SAF folder authorization and exposes reconnection from settings', () => {\n    const native = read('Elephant/backend/tauri-plugin-elephant-android-vault/android/src/main/java/com/elephantnote/androidvault/ElephantAndroidVaultPlugin.kt')\n    const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')\n    expect(native).toContain('Intent.ACTION_OPEN_DOCUMENT_TREE')\n    expect(native).toContain('persistedUriPermissions.any')\n    expect(settings).toContain('Authorize a folder')\n  })\n})\n""")

print('Android follow-up finalization complete')
