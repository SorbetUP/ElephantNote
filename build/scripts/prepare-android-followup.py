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
path.write_text(text)
print('Android follow-up transformer prepared')
