#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def patch(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Missing hotfix anchor in {path}: {old[:100]}')
    p.write_text(text.replace(old, new, 1))

# The desktop stub uses the plugin's existing unsupported helper.
patch(
    'Elephant/backend/tauri-plugin-elephant-android-vault/src/desktop.rs',
    '    pub fn share_text(&self, _request: ShareTextRequest) -> Result<()> {\n        Err(Error::UnsupportedPlatform)\n    }',
    '    pub fn share_text(&self, _request: ShareTextRequest) -> Result<()> {\n        self.unsupported()\n    }'
)

# Keep the Rust regression test dependency-free and construct the real descriptor shape.
path = ROOT / 'Elephant/backend/tauri/src/vault/entries.rs'
text = path.read_text()
old = '''    #[test]
    fn new_notes_have_empty_content() {
        let temp = tempfile::tempdir().unwrap();
        let vault = VaultDescriptor {
            id: "test".to_string(),
            name: "Test".to_string(),
            path: temp.path().to_string_lossy().to_string(),
            icon: None,
        };
        let entry = create_note(&vault, None, None, None).unwrap();
        let full_path = entry.get("fullPath").and_then(Value::as_str).unwrap();
        assert_eq!(fs::read_to_string(full_path).unwrap(), "");
    }
'''
new = '''    #[test]
    fn new_notes_have_empty_content() {
        let temp = std::env::temp_dir().join(format!(
            "elephantnote-empty-note-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp).unwrap();
        let vault = VaultDescriptor {
            id: "test".to_string(),
            name: "Test".to_string(),
            path: temp.to_string_lossy().to_string(),
            icon: String::new(),
            last_opened_at: "0".to_string(),
        };
        let entry = create_note(&vault, None, None, None).unwrap();
        let full_path = entry.get("fullPath").and_then(Value::as_str).unwrap();
        assert_eq!(fs::read_to_string(full_path).unwrap(), "");
        fs::remove_dir_all(temp).unwrap();
    }
'''
if old not in text:
    raise SystemExit('Missing generated empty-note test')
path.write_text(text.replace(old, new, 1))

# chooseVault returns a boolean and blank titles must propagate into every visible list.
patch(
    'Elephant/frontend/app/components/settings/SettingsPanel.vue',
    "    vaultMessage.value = result?.canceled\n      ? 'Folder authorization canceled.'\n      : 'Android folder access granted and vault connected.'",
    "    vaultMessage.value = result === false\n      ? 'Folder authorization canceled.'\n      : 'Android folder access granted and vault connected.'"
)
patch(
    'Elephant/frontend/app/stores/vaultStore.js',
    '          title: metadata.title || entry.title,',
    "          title: Object.prototype.hasOwnProperty.call(metadata, 'title') ? metadata.title : entry.title,"
)

print('Android follow-up hotfix complete')
