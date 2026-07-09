from pathlib import Path
import os
import subprocess

if os.environ.get('GITHUB_ACTIONS') == 'true':
    subprocess.run(['sudo', 'apt-get', 'update'], check=True)
    subprocess.run([
        'sudo', 'apt-get', 'install', '-y', '--no-install-recommends',
        'build-essential', 'curl', 'file', 'libayatana-appindicator3-dev',
        'libgtk-3-dev', 'librsvg2-dev', 'libssl-dev',
        'libwebkit2gtk-4.1-dev', 'patchelf', 'wget'
    ], check=True)

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
anchor = '''  #[test]
  fn turn_summary_does_not_log_prompt() {'''
test = '''  #[test]
  fn uses_protocol_compatible_sandbox_values() {
    let thread = json!({ "sandbox": "read-only" });
    assert_eq!(thread.get("sandbox").and_then(Value::as_str), Some("read-only"));
    let turn = json!({ "sandboxPolicy": { "type": "readOnly", "networkAccess": false } });
    assert_eq!(turn.pointer("/sandboxPolicy/type").and_then(Value::as_str), Some("readOnly"));
    assert_eq!(turn.pointer("/sandboxPolicy/networkAccess").and_then(Value::as_bool), Some(false));
  }

'''
if test not in backend:
    backend = backend.replace(anchor, test + anchor, 1)
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
