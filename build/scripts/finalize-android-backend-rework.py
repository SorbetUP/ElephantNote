#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]

def edit(path, transform):
    target = root / path
    before = target.read_text()
    after = transform(before)
    if before == after:
        raise SystemExit(f'No change applied to {path}')
    target.write_text(after)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing anchor {label}')
    return text.replace(old, new, 1)


def patch_lib(text):
    text = replace_once(
        text,
        'mod android_vault_commands;\nmod tauri_extra_commands;',
        'mod android_vault_commands;\nmod vault_binary_commands;\nmod tauri_extra_commands;',
        'lib module list',
    )
    for name in (
        'tauri_vault_read_binary',
        'tauri_vault_write_binary',
        'tauri_vault_ensure_dir',
        'tauri_vault_remove_path',
        'tauri_vault_rename_path',
    ):
        text = text.replace(f'tauri_extra_commands::{name}', f'vault_binary_commands::{name}')
    return text

edit('Elephant/backend/tauri/src/lib_min.rs', patch_lib)

package_path = root / 'package.json'
package = json.loads(package_path.read_text())
package['dependencies']['@tauri-apps/plugin-barcode-scanner'] = '^2.4.0'
package['dependencies'] = dict(sorted(package['dependencies'].items()))
package_path.write_text(json.dumps(package, indent=2) + '\n')

print('Backend finalization complete')
