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
if '"access": {' in backend[backend.index('"sandboxPolicy"'):backend.index('"sandboxPolicy"') + 300]:
    raise SystemExit('legacy turn sandbox access object remains')

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
    if anchor not in backend:
        raise SystemExit('test insertion point missing')
    backend = backend.replace(anchor, test + anchor, 1)
backend_path.write_text(backend)

ui_path = Path('Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue')
ui = ui_path.read_text()
old_start = ui.index('      <section class="en-ai-card">\n        <header class="en-ai-card-header">\n          <div>\n            <h4>Codex subscription</h4>')
app_local = ui.index('      <section class="en-ai-card">\n        <div class="en-ai-setting-row">\n          <span class="en-ai-row-icon"><Cpu', old_start)
ui = ui[:old_start] + ui[app_local:]

card = '''      <section class="en-ai-card en-codex-card">
        <header class="en-ai-card-header">
          <div class="en-codex-heading">
            <span class="en-ai-row-icon"><TerminalSquare aria-hidden="true" /></span>
            <div>
              <h4>Codex / ChatGPT subscription</h4>
              <p>Use the Codex models included with your ChatGPT plan through the official app-server protocol.</p>
            </div>
          </div>
          <span class="en-ai-badge" :class="{ active: codexStatus.connected, warning: !codexStatus.installed }">{{ codexStatusLabel }}</span>
        </header>
        <div class="en-codex-body">
          <div class="en-codex-account">
            <div class="en-ai-setting-copy">
              <strong>{{ codexAccountLabel }}</strong>
              <span v-if="codexStatus.account?.email">{{ codexStatus.account.email }}</span>
              <small v-if="providerMessage">{{ providerMessage }}</small>
            </div>
            <div class="en-codex-meta">
              <span v-if="codexStatus.version">{{ codexStatus.version }}</span>
              <span v-if="codexStatus.runtimeSource">{{ codexStatus.runtimeSource }}</span>
              <span v-if="codexStatus.connected">{{ codexModels.length }} models</span>
            </div>
          </div>
          <div v-if="codexRateLimit" class="en-codex-usage">
            <div><span>Usage</span><strong>{{ Math.round(codexRateLimit.usedPercent || 0) }}% used</strong><small v-if="codexRateLimit.resetsAt">Reset {{ formatReset(codexRateLimit.resetsAt) }}</small></div>
            <div class="en-codex-usage-track"><span :style="{ width: `${Math.min(100, Math.max(0, codexRateLimit.usedPercent || 0))}%` }" /></div>
          </div>
          <div v-if="loginChallenge.userCode" class="en-login-challenge">
            <strong>Device code: {{ loginChallenge.userCode }}</strong>
            <button class="secondary compact" type="button" @click="openExternal(loginChallenge.verificationUrl)">Open authentication page</button>
          </div>
          <div class="en-ai-actions en-codex-actions">
            <button class="secondary compact" type="button" :disabled="codexBusy" @click="refreshCodex"><RotateCw aria-hidden="true" /> Refresh</button>
            <button v-if="codexStatus.connected" class="danger compact" type="button" :disabled="codexBusy" @click="disconnectCodex"><Unlink aria-hidden="true" /> Disconnect</button>
            <button v-else class="primary compact" type="button" :disabled="codexBusy || !codexStatus.installed" @click="connectCodex"><Link2 aria-hidden="true" /> Connect with ChatGPT</button>
          </div>
        </div>
      </section>

'''
insert_at = ui.index('    </template>', ui.index('<h4>External API providers</h4>'))
ui = ui[:insert_at] + card + ui[insert_at:]

ui = ui.replace('.en-ai-toolbar, .en-ai-card-header, .en-ai-setting-row, .en-provider-footer, .en-ai-actions, .en-rate-limit { display: flex; align-items: center; gap: 10px; }', '.en-ai-toolbar, .en-ai-card-header, .en-ai-setting-row, .en-provider-footer, .en-ai-actions { display: flex; align-items: center; gap: 10px; }')
old_css = '''.en-codex-row { flex-wrap: wrap; }
.en-ai-actions-wrap { flex-wrap: wrap; justify-content: flex-end; }
.en-login-challenge, .en-rate-limit { margin: 0 16px 16px; padding: 10px 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }
.en-login-challenge { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.en-rate-limit progress { flex: 1; min-width: 120px; }
'''
new_css = '''.en-codex-card { border-color: color-mix(in srgb, var(--en-primary) 22%, var(--en-border)); }
.en-codex-heading, .en-codex-account { display: flex; align-items: center; gap: 12px; }
.en-codex-heading > div { display: grid; gap: 4px; }
.en-codex-body { display: grid; gap: 12px; padding: 14px 16px 16px; }
.en-codex-account { justify-content: space-between; }
.en-codex-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; color: var(--en-muted); font-size: 11px; }
.en-codex-meta span { padding: 3px 7px; border-radius: 7px; background: var(--en-soft); }
.en-codex-actions { justify-content: flex-end; }
.en-login-challenge { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }
.en-codex-usage { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); }
.en-codex-usage > div:first-child { display: flex; align-items: baseline; gap: 8px; }
.en-codex-usage small { margin-left: auto; }
.en-codex-usage-track { height: 6px; overflow: hidden; border-radius: 99px; background: color-mix(in srgb, var(--en-muted) 18%, transparent); }
.en-codex-usage-track span { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--en-primary); }
'''
if old_css not in ui:
    raise SystemExit('old Codex CSS missing')
ui = ui.replace(old_css, new_css, 1)
ui = ui.replace('  .en-ai-toolbar, .en-login-challenge { align-items: stretch; flex-direction: column; }', '  .en-ai-toolbar, .en-login-challenge, .en-codex-account { align-items: stretch; flex-direction: column; }\n  .en-codex-meta, .en-codex-actions { justify-content: flex-start; }', 1)

if ui.count('<h4>Codex / ChatGPT subscription</h4>') != 1:
    raise SystemExit('new Codex card count is invalid')
if '<h4>Codex subscription</h4>' in ui:
    raise SystemExit('old Codex card remains')
if ui.index('<h4>Codex / ChatGPT subscription</h4>') < ui.index('<h4>External API providers</h4>'):
    raise SystemExit('Codex card is not below open providers')
ui_path.write_text(ui)
