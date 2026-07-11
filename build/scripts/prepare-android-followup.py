#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name('finalize-android-followup.py')
text = path.read_text()
start_marker = "path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/mobile.rs'\n"
end_marker = "# Desktop implementation needs the same API surface, but sharing is Android-only.\n"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Unable to locate mobile plugin transformer block')
replacement = '''path = 'Elephant/backend/tauri-plugin-elephant-android-vault/src/mobile.rs'
replace(path,
"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\\n        self.0\\n            .run_mobile_plugin(\\\"clear\\\", payload)\\n            .map_err(Into::into)\\n    }\\n",
"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\\n        self.0\\n            .run_mobile_plugin(\\\"clear\\\", payload)\\n            .map_err(Into::into)\\n    }\\n\\n    pub fn share_text(&self, payload: ShareTextRequest) -> Result<()> {\\n        self.0\\n            .run_mobile_plugin(\\\"shareText\\\", payload)\\n            .map_err(Into::into)\\n    }\\n")

'''
path.write_text(text[:start] + replacement + text[end:])
print('Android follow-up transformer prepared')
