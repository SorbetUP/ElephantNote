from pathlib import Path
import subprocess

backend_path = Path('Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs')
backend = backend_path.read_text()
backend = backend.replace('"sandbox": "readOnly",', '"sandbox": "read-only",', 1)
backend = backend.replace('''"sandboxPolicy": {
          "type": "readOnly",
          "access": {
            "type": "restricted",
            "includePlatformDefaults": true,
            "readableRoots": [cwd.to_string_lossy()]
          }
        }''', '''"sandboxPolicy": {
          "type": "readOnly",
          "networkAccess": false
        }''', 1)
if '"sandbox": "readOnly"' in backend:
    raise SystemExit('legacy thread sandbox value remains')
backend_path.write_text(backend)

ui_path = Path('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
ui = ui_path.read_text()
start = ui.index('      <section class="en-ai-card">\n        <header class="en-ai-card-header">\n          <div>\n            <h4>Codex subscription</h4>')
next_card = ui.index('      <section class="en-ai-card">\n        <div class="en-ai-setting-row">\n          <span class="en-ai-row-icon"><Cpu', start)
block = ui[start:next_card]
ui = ui[:start] + ui[next_card:]
end = ui.index('    </template>', ui.index('<h4>External API providers</h4>'))
ui = ui[:end] + block + ui[end:]
ui = ui.replace('.en-codex-row { flex-wrap: wrap; }', '.en-codex-row { flex-wrap: wrap; padding-top: 12px; padding-bottom: 12px; }', 1)
ui = ui.replace('.en-login-challenge, .en-rate-limit { margin: 0 16px 16px; padding: 10px 12px;', '.en-login-challenge, .en-rate-limit { margin: 0 16px 14px; padding: 8px 10px;', 1)
ui = ui.replace('.en-rate-limit progress { flex: 1; min-width: 120px; }', '.en-rate-limit progress { flex: 1; min-width: 120px; height: 8px; }', 1)
if ui.count('<h4>Codex subscription</h4>') != 1:
    raise SystemExit('Codex card count is invalid')
if ui.index('<h4>Codex subscription</h4>') < ui.index('<h4>External API providers</h4>'):
    raise SystemExit('Codex card is not below providers')
ui_path.write_text(ui)

subprocess.run(['cargo', 'fmt', '--manifest-path', 'Elephant/backend/tauri/Cargo.toml', '--all'], check=True)
for path in [
    '.github/workflows/one-time-codex-chat-fix.yml',
    '.github/workflows/one-time-codex-chat-fix-pr.yml',
    'build/scripts/codex_followup_patch.py',
    'build/scripts/codex_followup_patch_v2.py',
    'build/scripts/codex_apply_and_cleanup.py',
]:
    Path(path).unlink(missing_ok=True)
subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', '-A'], check=True)
subprocess.run(['git', 'commit', '-m', 'Fix Codex chat sandbox contract and compact provider settings'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:feature/real-codex-subscription'], check=True)
