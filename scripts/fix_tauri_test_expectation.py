from pathlib import Path

path = Path('tests/elephant/unit/aiProviders.spec.js')
text = path.read_text()
old = "expect(resolveAiEndpoint({ transport: 'tauri-rust', endpoint: '' })).toBe('tauri-rust://local')"
new = "expect(resolveAiEndpoint({ transport: 'tauri-rust', endpoint: '' })).toBe('')"
if text.count(old) != 1:
    raise SystemExit(f'expected one Tauri endpoint assertion, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
