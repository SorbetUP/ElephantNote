#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name('finalize-android-followup.py')
text = path.read_text()

mobile_start_marker = "path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/mobile.rs'\n"
desktop_comment_marker = "# Desktop implementation needs the same API surface, but sharing is Android-only.\n"
mobile_start = text.find(mobile_start_marker)
desktop_comment = text.find(desktop_comment_marker, mobile_start)
if mobile_start < 0 or desktop_comment < 0:
    raise SystemExit('Unable to locate mobile plugin transformer block')
mobile_replacement = '''path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/mobile.rs'
replace(path,
"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\\n        self.0\\n            .run_mobile_plugin(\\\"clear\\\", payload)\\n            .map_err(Into::into)\\n    }\\n",
"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\\n        self.0\\n            .run_mobile_plugin(\\\"clear\\\", payload)\\n            .map_err(Into::into)\\n    }\\n\\n    pub fn share_text(&self, payload: ShareTextRequest) -> Result<()> {\\n        self.0\\n            .run_mobile_plugin(\\\"shareText\\\", payload)\\n            .map_err(Into::into)\\n    }\\n")

'''
text = text[:mobile_start] + mobile_replacement + text[desktop_comment:]

desktop_start_marker = "path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/desktop.rs'\n"
android_commands_marker = "path = 'Elephant/backend/tauri/src/android_vault_commands.rs'\n"
desktop_start = text.find(desktop_start_marker)
android_commands = text.find(android_commands_marker, desktop_start)
if desktop_start < 0 or android_commands < 0:
    raise SystemExit('Unable to locate desktop plugin transformer block')
desktop_replacement = '''path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/desktop.rs'
replace(path,
"    pub fn clear(&self, _payload: ShadowRequest) -> Result<TreeState> {\\n        self.unsupported()\\n    }\\n",
"    pub fn share_text(&self, _request: ShareTextRequest) -> Result<()> {\\n        Err(Error::UnsupportedPlatform)\\n    }\\n\\n    pub fn clear(&self, _payload: ShadowRequest) -> Result<TreeState> {\\n        self.unsupported()\\n    }\\n")

'''
text = text[:desktop_start] + desktop_replacement + text[android_commands:]

settings_start_marker = "path = 'Elephant/frontend/app/components/settings/SettingsPanel.vue'\n"
asset_comment_marker = "# 7. Enable Tauri's supported asset protocol for images stored in the app data vault.\n"
settings_start = text.find(settings_start_marker)
asset_comment = text.find(asset_comment_marker, settings_start)
if settings_start < 0 or asset_comment < 0:
    raise SystemExit('Unable to locate SettingsPanel transformer block')
settings_replacement = '''path = 'Elephant/frontend/app/components/settings/SettingsPanel.vue'
replace(path,
"                <div class=\\\"en-settings-row\\\">\\n                  <div class=\\\"en-settings-row-copy\\\"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>\\n                  <span class=\\\"en-status-badge active\\\"><HardDrive aria-hidden=\\\"true\\\" />{{ activeVaultName }}</span>\\n                </div>\\n",
"                <div class=\\\"en-settings-row\\\">\\n                  <div class=\\\"en-settings-row-copy\\\"><strong>Active vault</strong><span>{{ activeVaultPath || 'No vault is currently open.' }}</span></div>\\n                  <span class=\\\"en-status-badge active\\\"><HardDrive aria-hidden=\\\"true\\\" />{{ activeVaultName }}</span>\\n                </div>\\n                <div class=\\\"en-settings-row\\\">\\n                  <div class=\\\"en-settings-row-copy\\\"><strong>Android folder access</strong><span>Open Android's system folder picker. Selecting a folder grants Elephant persistent access only to that folder.</span></div>\\n                  <button class=\\\"en-primary-button\\\" type=\\\"button\\\" :disabled=\\\"isChoosingAndroidVault\\\" @click=\\\"chooseAndroidVault\\\"><FolderOpen aria-hidden=\\\"true\\\" />{{ isChoosingAndroidVault ? 'Opening…' : 'Authorize a folder' }}</button>\\n                </div>\\n")
replace(path,
"  { id: 'vault-open', section: 'vaults', label: 'Open vaults', description: 'Review or remove registered vaults.' },\\n",
"  { id: 'vault-open', section: 'vaults', label: 'Open vaults', description: 'Review or remove registered vaults.' },\\n  { id: 'vault-android-access', section: 'vaults', label: 'Android folder access', description: 'Authorize or reconnect a folder with Android system storage.' },\\n")
replace(path,
"const removingVaultId = ref('')\\n",
"const removingVaultId = ref('')\\nconst isChoosingAndroidVault = ref(false)\\n")
replace(path,
"const removeVaultFromApp = async (vault) => {\\n",
"const chooseAndroidVault = async () => {\\n  isChoosingAndroidVault.value = true\\n  vaultMessage.value = ''\\n  try {\\n    const result = await vaultStore.chooseVault()\\n    vaultMessage.value = result?.canceled\\n      ? 'Folder authorization canceled.'\\n      : 'Android folder access granted and vault connected.'\\n  } catch (error) {\\n    vaultMessage.value = error instanceof Error ? error.message : 'Unable to authorize the Android folder.'\\n  } finally {\\n    isChoosingAndroidVault.value = false\\n  }\\n}\\n\\nconst removeVaultFromApp = async (vault) => {\\n")

'''
text = text[:settings_start] + settings_replacement + text[asset_comment:]
path.write_text(text)
print('Android follow-up transformer prepared')
