#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]

def patch(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Missing safety anchor in {path}: {old[:100]}')
    p.write_text(text.replace(old, new, 1))

# A missing CSP is intentionally unrestricted; only enable the scoped asset protocol.
config_path = ROOT / 'Elephant/backend/tauri/tauri.android.conf.json'
config = json.loads(config_path.read_text())
config.get('app', {}).get('security', {}).pop('csp', None)
config_path.write_text(json.dumps(config, indent=2) + '\n')

# Do not attempt to resolve an already converted Tauri asset URL as a local path.
patch(
    'Elephant/frontend/app/components/editor/NoteEditorHost.vue',
    "const isExternalAssetReference = (value = '') =>\n  /^(?:https?:|data:|blob:|#)/i.test(String(value || '').trim())",
    "const isExternalAssetReference = (value = '') =>\n  /^(?:https?:|asset:|data:|blob:|#)/i.test(String(value || '').trim())"
)

# A title-less note must stay title-less in recent-note metadata too.
patch(
    'Elephant/frontend/app/stores/vaultStore.js',
    "          title: entry.title || entry.path.split('/').pop()?.replace(/\\.md$/i, '') || 'Untitled',",
    "          title: Object.prototype.hasOwnProperty.call(entry, 'title') ? entry.title : (entry.path.split('/').pop()?.replace(/\\.md$/i, '') || 'Untitled'),"
)

print('Android follow-up safety pass complete')
